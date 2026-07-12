import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunnerCli, loadOpenRouterApiKey } from '../src/runnerCli.js';
import { readState } from '../src/state.js';

// test/runnerCli.test.ts -> platform/runner is a sibling of web/ (same depth as
// src/runnerCli.ts's own RUNNER_DIR, since test/ and src/ sit at the same level).
const RUNNER_DIR = fileURLToPath(new URL('../../../runner', import.meta.url));

function initGitWorkspace(workspaceRoot: string): void {
  mkdirSync(workspaceRoot, { recursive: true });
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  writeFileSync(join(workspaceRoot, 'README.md'), 'seed');
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: workspaceRoot });
}

describe('runnerCli against the real runner CLI', () => {
  let workspaceRoot: string;
  const runnerCli = createRunnerCli(RUNNER_DIR);

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'runner-cli-'));
    initGitWorkspace(workspaceRoot);
  }, 20000);

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('approveStage shells out to `runner approve` and updates state.json', async () => {
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.runner', 'state.json'),
      JSON.stringify({ stages: { '01_research': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' } } })
    );

    await runnerCli.approveStage(workspaceRoot, '01_research');

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
  }, 20000);

  it('rejectStage shells out to `runner reject` with the comment and updates state.json', async () => {
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.runner', 'state.json'),
      JSON.stringify({ stages: { '01_research': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' } } })
    );

    await runnerCli.rejectStage(workspaceRoot, '01_research', 'needs more depth');

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('rejected');
    expect(state.stages['01_research'].comment).toBe('needs more depth');
  }, 20000);

  it('approveStage rejects its promise when the CLI exits non-zero', async () => {
    // No stages/ dir and an invalid stage name the CLI itself will refuse silently
    // isn't guaranteed to fail, so force a real failure: point at a workspace with
    // no .git at all, which `runner approve`'s commitWorkspace step cannot handle.
    const noGitDir = mkdtempSync(join(tmpdir(), 'runner-cli-nogit-'));
    await expect(runnerCli.approveStage(noGitDir, '01_research')).rejects.toThrow();
    rmSync(noGitDir, { recursive: true, force: true });
  }, 20000);
});

describe('loadOpenRouterApiKey', () => {
  let envDir: string;

  beforeEach(() => {
    envDir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  });

  afterEach(() => {
    rmSync(envDir, { recursive: true, force: true });
  });

  it('returns undefined when the .env file does not exist', () => {
    expect(loadOpenRouterApiKey(join(envDir, 'missing.env'))).toBeUndefined();
  });

  it('parses OPENROUTER_API_KEY out of a .env file', () => {
    const envPath = join(envDir, '.env');
    writeFileSync(envPath, 'SOME_OTHER_VAR=x\nOPENROUTER_API_KEY=sk-or-test-value\n');
    expect(loadOpenRouterApiKey(envPath)).toBe('sk-or-test-value');
  });

  it('returns undefined when the file exists but has no OPENROUTER_API_KEY line', () => {
    const envPath = join(envDir, '.env');
    writeFileSync(envPath, 'SOME_OTHER_VAR=x\n');
    expect(loadOpenRouterApiKey(envPath)).toBeUndefined();
  });
});
