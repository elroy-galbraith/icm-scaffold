import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative, extname } from 'node:path';
import { resolveInJail } from './jail.js';
import type { ToolDef } from './openrouter.js';

export const RUN_SCRIPT_DEF: ToolDef = {
  type: 'function',
  function: {
    name: 'run_script',
    description:
      "Run a deterministic script committed under a stage's scripts/ directory (e.g. stages/02_analysis/scripts/compute.py).",
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Workspace-relative path to the script.' },
        args: { type: 'array', items: { type: 'string' } },
      },
      required: ['script'],
    },
  },
};

const STAGE_SCRIPTS_SEGMENT_INDEX = 2;
export const SCRIPT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 100 * 1024;
const TRUNCATION_MARKER = '\n[... output truncated at 100KB ...]';

function isUnderStageScriptsDir(root: string, resolvedPath: string): boolean {
  const segments = relative(root, resolvedPath).split('/');
  return segments[0] === 'stages' && segments[STAGE_SCRIPTS_SEGMENT_INDEX] === 'scripts' && segments.length >= 4;
}

function interpreterFor(scriptPath: string): string | null {
  const ext = extname(scriptPath);
  if (ext === '.py') return 'python3';
  if (ext === '.js' || ext === '.mjs') return 'node';
  return null;
}

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT_BYTES) return output;
  return output.slice(0, MAX_OUTPUT_BYTES) + TRUNCATION_MARKER;
}

export function runScript(workspaceRoot: string, script: string, args: string[]): { ok: boolean; content: string } {
  return runScriptWithTimeout(workspaceRoot, script, args, SCRIPT_TIMEOUT_MS);
}

export function runScriptWithTimeout(
  workspaceRoot: string,
  script: string,
  args: string[],
  timeoutMs: number
): { ok: boolean; content: string } {
  const root = realpathSync(workspaceRoot);

  let resolved: string;
  try {
    resolved = resolveInJail(root, script);
  } catch (err) {
    return { ok: false, content: err instanceof Error ? err.message : String(err) };
  }

  if (!isUnderStageScriptsDir(root, resolved)) {
    return {
      ok: false,
      content: `Refused: script must live under a stage's scripts/ directory (got "${script}")`,
    };
  }

  const interpreter = interpreterFor(resolved);
  if (!interpreter) {
    return {
      ok: false,
      content: `Refused: unsupported script extension for "${script}" (allowed: .py, .js, .mjs)`,
    };
  }

  try {
    const output = execFileSync(interpreter, [resolved, ...args], {
      cwd: root,
      timeout: timeoutMs,
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf-8',
    });
    return { ok: true, content: truncate(output) };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string | null;
    };
    if (e.killed && e.signal) {
      return { ok: false, content: `Script timed out after ${timeoutMs}ms (killed with ${e.signal})` };
    }
    if (e.code === 'ETIMEDOUT' || String(e.message).includes('ETIMEDOUT')) {
      return { ok: false, content: `Script timed out after ${timeoutMs}ms` };
    }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n') || e.message || String(err);
    return { ok: false, content: truncate(combined) };
  }
}
