import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, releaseLock, readLock, LockHeldError } from '../src/lock.js';

describe('lock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lock-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('acquires a lock and records it', () => {
    acquireLock(workspaceRoot, 'run-1');
    const lock = readLock(workspaceRoot);
    expect(lock?.runId).toBe('run-1');
    expect(lock?.pid).toBe(process.pid);
  });

  it('rejects a second acquire while the first is held', () => {
    acquireLock(workspaceRoot, 'run-1');
    expect(() => acquireLock(workspaceRoot, 'run-2')).toThrow(LockHeldError);
  });

  it('reports the holder on LockHeldError', () => {
    acquireLock(workspaceRoot, 'run-1');
    try {
      acquireLock(workspaceRoot, 'run-2');
      throw new Error('expected LockHeldError');
    } catch (err) {
      expect(err).toBeInstanceOf(LockHeldError);
      expect((err as LockHeldError).holder.runId).toBe('run-1');
    }
  });

  it('allows re-acquiring after release', () => {
    acquireLock(workspaceRoot, 'run-1');
    releaseLock(workspaceRoot);
    expect(readLock(workspaceRoot)).toBeNull();
    acquireLock(workspaceRoot, 'run-2');
    expect(readLock(workspaceRoot)?.runId).toBe('run-2');
  });

  it('releasing an unlocked workspace is a no-op', () => {
    expect(() => releaseLock(workspaceRoot)).not.toThrow();
  });
});
