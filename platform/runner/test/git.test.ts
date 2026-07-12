import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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

  it('never tracks .runner.lock or .runner/ contents in the audit-trail commit', () => {
    writeFileSync(join(workspaceRoot, 'output.txt'), 'result');
    writeFileSync(join(workspaceRoot, '.runner.lock'), 'pid: 1234');
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.runner', 'state.json'), '{"stage":"01_research"}');

    const after = commitWorkspace(workspaceRoot, 'stage run');

    const committedFiles = execFileSync('git', ['show', '--stat', '--name-only', '--pretty=format:', after], {
      cwd: workspaceRoot,
    })
      .toString()
      .split('\n')
      .filter((line) => line.trim().length > 0);

    expect(committedFiles).toContain('output.txt');
    expect(committedFiles).not.toContain('.runner.lock');
    expect(committedFiles.some((f) => f.startsWith('.runner/'))).toBe(false);

    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
    const statusLines = status.split('\n').filter((line) => line.trim().length > 0);
    for (const line of statusLines) {
      // Anything reported must be untracked (?? prefix) for .runner.lock or .runner/,
      // never staged, committed-then-deleted, or otherwise tracked.
      expect(line.startsWith('??')).toBe(true);
      const path = line.slice(3).trim();
      expect(path === '.runner.lock' || path.startsWith('.runner/')).toBe(true);
    }
  });
});
