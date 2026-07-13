import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitWorkspace, currentHead, getTree, getDiff, getLog } from '../src/git.js';

describe('git', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'web-git-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n');
    writeFileSync(join(workspaceRoot, 'README.md'), 'seed');
    commitWorkspace(workspaceRoot, 'seed commit');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('commits changed files and advances HEAD', () => {
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
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(join(workspaceRoot, '.runner', 'state.json'), '{}');
    writeFileSync(join(workspaceRoot, '.gitignore'), '.runner/\n');
    const tree = getTree(workspaceRoot);
    expect(tree.map((e) => e.path)).toContain('.runner/state.json');
  });

  it('getDiff shows a non-empty unified diff for a changed file', () => {
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n\nChanged.\n');
    commitWorkspace(workspaceRoot, 'change findings');
    const result = getDiff(workspaceRoot, 'stages/01_research/output/findings.md', 'HEAD~1');
    expect(result.path).toBe('stages/01_research/output/findings.md');
    expect(result.ref).toBe('HEAD~1');
    expect(result.diff).toContain('Changed');
  });

  it('getDiff returns an empty string for an unchanged file', () => {
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
    writeFileSync(join(workspaceRoot, 'README.md'), 'v2');
    commitWorkspace(workspaceRoot, 'second commit');
    const log = getLog(workspaceRoot, 1);
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('second commit');
    expect(log[0].sha).toHaveLength(40);
    expect(new Date(log[0].date).toISOString()).toBe(log[0].date);
  });

  it('getLog returns [] rather than throwing for a repo with no commits yet', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'web-git-empty-'));
    execFileSync('git', ['init'], { cwd: emptyRoot });
    expect(getLog(emptyRoot, 50)).toEqual([]);
    rmSync(emptyRoot, { recursive: true, force: true });
  });

  it('getTree does not follow a symlink that escapes the workspace', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'web-git-outside-'));
    writeFileSync(join(outsideDir, 'secret.md'), 'outside content');
    symlinkSync(outsideDir, join(workspaceRoot, 'escape-link'));

    const tree = getTree(workspaceRoot);
    const linkEntry = tree.find((e) => e.path === 'escape-link');

    expect(linkEntry?.type).toBe('file');
    expect(tree.map((e) => e.path)).not.toContain('escape-link/secret.md');

    rmSync(outsideDir, { recursive: true, force: true });
  });
});
