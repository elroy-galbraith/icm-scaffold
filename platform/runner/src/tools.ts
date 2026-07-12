import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveInJail } from './jail.js';
import type { ToolDef } from './openrouter.js';
import type { ToolCallLogEntry } from './runLog.js';
import { FETCH_URL_DEF, fetchUrl } from './webTool.js';
import { RUN_SCRIPT_DEF, runScript } from './scriptTool.js';

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file at a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write UTF-8 text content to a path relative to the workspace root, creating parent directories as needed.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List entries in a directory at a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_stage',
      description:
        'Call this when the stage is complete and ready for human review. Provide the gate summary shown to the reviewer, including the stage Verify checklist.',
      parameters: {
        type: 'object',
        properties: { gateSummary: { type: 'string' } },
        required: ['gateSummary'],
      },
    },
  },
  FETCH_URL_DEF,
  RUN_SCRIPT_DEF,
];

export interface ToolContext {
  workspaceRoot: string;
  filesRead: Set<string>;
  filesWritten: Set<string>;
  toolCalls: ToolCallLogEntry[];
  finished: boolean;
  gateSummary?: string;
  allowedDomains: string[];
}

export interface ToolResult {
  ok: boolean;
  content: string;
}

export function createToolContext(workspaceRoot: string, allowedDomains: string[] = []): ToolContext {
  return {
    workspaceRoot,
    filesRead: new Set(),
    filesWritten: new Set(),
    toolCalls: [],
    finished: false,
    allowedDomains,
  };
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const timestamp = new Date().toISOString();
  try {
    const content = await runTool(name, args, ctx);
    ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'ok', timestamp });
    return { ok: true, content };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'error', errorMessage, timestamp });
    return { ok: false, content: errorMessage };
  }
}

async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  switch (name) {
    case 'read_file': {
      const path = requireString(args, 'path');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      const content = readFileSync(resolved, 'utf-8');
      ctx.filesRead.add(path);
      return content;
    }
    case 'write_file': {
      const path = requireString(args, 'path');
      const content = requireString(args, 'content');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, content, 'utf-8');
      ctx.filesWritten.add(path);
      return `Wrote ${content.length} bytes to ${path}`;
    }
    case 'list_dir': {
      const path = requireString(args, 'path');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      const entries = readdirSync(resolved).map((entry) => {
        const isDir = statSync(join(resolved, entry)).isDirectory();
        return isDir ? `${entry}/` : entry;
      });
      return entries.join('\n');
    }
    case 'finish_stage': {
      const gateSummary = requireString(args, 'gateSummary');
      ctx.finished = true;
      ctx.gateSummary = gateSummary;
      return 'Stage marked finished; awaiting human review.';
    }
    case 'fetch_url': {
      const url = requireString(args, 'url');
      const result = await fetchUrl(url, ctx.allowedDomains);
      if (!result.ok) throw new Error(result.content);
      return result.content;
    }
    case 'run_script': {
      const script = requireString(args, 'script');
      const scriptArgs = Array.isArray(args.args) ? (args.args as string[]) : [];
      const result = runScript(ctx.workspaceRoot, script, scriptArgs);
      if (!result.ok) throw new Error(result.content);
      return result.content;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid "${key}" argument`);
  }
  return value;
}
