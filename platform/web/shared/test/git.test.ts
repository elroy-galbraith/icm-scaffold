import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getLog, getTree, getDiff, commitWorkspace, currentHead } from '../src/git.js';

describe('git.ts', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'shared-git-test-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('getLog returns an empty array for a repo with no commits yet, instead of throwing', () => {
    expect(getLog(workspaceRoot, 50)).toEqual([]);
  });

  it('getTree does not follow a symlink that points outside the workspace', () => {
    const { symlinkSync, writeFileSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    const outside = mkdtempSync(join(tmpdir(), 'shared-git-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'top secret');
    symlinkSync(outside, join(workspaceRoot, 'escape-link'));

    const entries = getTree(workspaceRoot);
    const link = entries.find((e) => e.path === 'escape-link');
    expect(link?.type).toBe('file');
    expect(entries.some((e) => e.path.startsWith('escape-link/'))).toBe(false);

    rmSync(outside, { recursive: true, force: true });
  });
});

// Ported from the now-deleted mock-server/test/git.test.ts and
// server/test/git.test.ts (identical between the two, aside from the
// empty-repo/symlink regression tests above, which originated in server's
// copy only). This is the general behavioral coverage of the git.ts module
// itself; kept here since it exercised behavior (e.g. non-empty diff
// content, multi-commit getLog ordering/limit) that server's own route-level
// tests don't independently cover.
describe('git.ts (seeded workspace)', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'shared-git-seeded-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n');
    writeFileSync(join(workspaceRoot, 'README.md'), 'seed');
    commitWorkspace(workspaceRoot, 'seed commit');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('commits changed files and advances HEAD', () => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    const before = currentHead(workspaceRoot);
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n\nMore.\n');
    const after = commitWorkspace(workspaceRoot, 'edit findings');
    expect(after).not.toBe(before);
    expect(currentHead(workspaceRoot)).toBe(after);
  });

  it('is a no-op when nothing changed', () => {
    const before = currentHead(workspaceRoot);
    const after = commitWorkspace(workspaceRoot, 'nothing to commit');
    expect(after).toBe(before);
  });

  it('getTree lists files and directories, excluding .git', () => {
    const tree = getTree(workspaceRoot);
    const paths = tree.map((e) => e.path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('stages/01_research/output/findings.md');
    expect(paths.some((p) => p.startsWith('.git'))).toBe(false);
    const readmeEntry = tree.find((e) => e.path === 'README.md');
    expect(readmeEntry?.type).toBe('file');
    const stagesEntry = tree.find((e) => e.path === 'stages');
    expect(stagesEntry?.type).toBe('dir');
  });

  it('getTree includes gitignored .runner content', () => {
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.runner', 'state.json'), '{}');
    writeFileSync(join(workspaceRoot, '.gitignore'), '.runner/\n');
    const tree = getTree(workspaceRoot);
    expect(tree.map((e) => e.path)).toContain('.runner/state.json');
  });

  it('getDiff shows a non-empty unified diff for a changed file', () => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n\nChanged.\n');
    commitWorkspace(workspaceRoot, 'change findings');
    const result = getDiff(workspaceRoot, 'stages/01_research/output/findings.md', 'HEAD~1');
    expect(result.path).toBe('stages/01_research/output/findings.md');
    expect(result.ref).toBe('HEAD~1');
    expect(result.diff).toContain('Changed');
  });

  it('getDiff returns an empty string for an unchanged file', () => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(join(workspaceRoot, 'README.md'), 'unrelated change');
    commitWorkspace(workspaceRoot, 'unrelated');
    const result = getDiff(workspaceRoot, 'stages/01_research/output/findings.md', 'HEAD~1');
    expect(result.diff).toBe('');
  });

  it('getDiff returns an empty string rather than throwing when the ref does not resolve', () => {
    const result = getDiff(workspaceRoot, 'README.md', 'HEAD~5');
    expect(result.diff).toBe('');
  });

  it('getLog returns commits newest first, respecting the limit', () => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs');
    writeFileSync(join(workspaceRoot, 'README.md'), 'v2');
    commitWorkspace(workspaceRoot, 'second commit');
    const log = getLog(workspaceRoot, 1);
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('second commit');
    expect(log[0].sha).toHaveLength(40);
    expect(new Date(log[0].date).toISOString()).toBe(log[0].date);
  });
});
