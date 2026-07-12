import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript, runScriptWithTimeout, RUN_SCRIPT_DEF } from '../src/scriptTool.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/scriptWorkspace', import.meta.url));

describe('RUN_SCRIPT_DEF', () => {
  it('describes the run_script tool', () => {
    expect(RUN_SCRIPT_DEF.function.name).toBe('run_script');
    expect(RUN_SCRIPT_DEF.function.parameters).toMatchObject({ required: ['script'] });
  });
});

describe('runScript', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'scripttool-'));
    cpSync(FIXTURE_DIR, workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('runs a Python script under a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/hello.py', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello from python');
  });

  it('runs a Node script under a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/hello.js', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello from node');
  });

  it('passes args through to the script', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/echo_args.py', ['foo', 'bar']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('foo bar');
  });

  it('refuses a script outside a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/other/notallowed.py', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/scripts/);
  });

  it('refuses a path that escapes the workspace', () => {
    const result = runScript(workspaceRoot, '../../etc/passwd', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/jail/i);
  });

  it('reports a non-zero exit without throwing', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/fail.py', []);
    expect(result.ok).toBe(false);
    expect(result.content).toContain('boom');
  });

  it('does not leak OPENROUTER_API_KEY into the script environment', () => {
    const previous = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'super-secret';
    try {
      const result = runScript(workspaceRoot, 'stages/01_research/scripts/print_env.py', []);
      expect(result.ok).toBe(true);
      expect(result.content).not.toContain('super-secret');
      expect(result.content).toContain('NOT_SET');
    } finally {
      process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it('kills a script that runs past its timeout', () => {
    const result = runScriptWithTimeout(workspaceRoot, 'stages/01_research/scripts/sleep.py', [], 200);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/timed out|timeout/i);
  }, 10_000);

  it('refuses an unsupported script extension', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/unsupported.sh', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/extension/i);
  });

  it('truncates script output over the 100KB cap', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/big_output.py', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(200_000);
  });
});
