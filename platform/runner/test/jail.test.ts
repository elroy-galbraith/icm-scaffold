import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInJail, JailViolationError } from '../src/jail.js';

describe('resolveInJail', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'jail-root-')));
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'jail-outside-')));
    mkdirSync(join(root, 'output'));
    writeFileSync(join(outside, 'secret.txt'), 'nope');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('resolves a normal relative path inside the workspace', () => {
    const resolved = resolveInJail(root, 'output/findings.md');
    expect(resolved).toBe(join(root, 'output', 'findings.md'));
  });

  it('rejects ../ traversal out of the workspace', () => {
    expect(() => resolveInJail(root, '../secret.txt')).toThrow(JailViolationError);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveInJail(root, '/etc/passwd')).toThrow(JailViolationError);
  });

  it('rejects a symlink that escapes the workspace', () => {
    symlinkSync(outside, join(root, 'escape'));
    expect(() => resolveInJail(root, 'escape/secret.txt')).toThrow(JailViolationError);
  });

  it('allows a new file path that does not exist yet', () => {
    const resolved = resolveInJail(root, 'output/new-file.md');
    expect(resolved).toBe(join(root, 'output', 'new-file.md'));
  });
});
