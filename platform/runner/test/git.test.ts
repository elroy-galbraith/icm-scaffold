import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitWorkspace, currentHead } from '../src/git.js';

describe('git', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'git-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    writeFileSync(join(workspaceRoot, 'seed.txt'), 'seed');
    commitWorkspace(workspaceRoot, 'seed commit');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('commits changed files and advances HEAD', () => {
    const before = currentHead(workspaceRoot);
    writeFileSync(join(workspaceRoot, 'output.txt'), 'result');
    const after = commitWorkspace(workspaceRoot, 'stage run');
    expect(after).not.toBe(before);
    expect(currentHead(workspaceRoot)).toBe(after);
  });

  it('is a no-op when nothing changed', () => {
    const before = currentHead(workspaceRoot);
    const after = commitWorkspace(workspaceRoot, 'nothing to commit');
    expect(after).toBe(before);
  });
});
