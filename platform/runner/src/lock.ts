import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface LockInfo {
  runId: string;
  pid: number;
  acquiredAt: string;
}

export class LockHeldError extends Error {
  constructor(public readonly holder: LockInfo) {
    super(`Workspace is locked by run ${holder.runId} (pid ${holder.pid}) since ${holder.acquiredAt}`);
    this.name = 'LockHeldError';
  }
}

function lockPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner.lock');
}

export function acquireLock(workspaceRoot: string, runId: string): void {
  const path = lockPath(workspaceRoot);
  if (existsSync(path)) {
    const holder = JSON.parse(readFileSync(path, 'utf-8')) as LockInfo;
    throw new LockHeldError(holder);
  }
  const info: LockInfo = { runId, pid: process.pid, acquiredAt: new Date().toISOString() };
  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(path, JSON.stringify(info, null, 2));
}

export function releaseLock(workspaceRoot: string): void {
  const path = lockPath(workspaceRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function readLock(workspaceRoot: string): LockInfo | null {
  const path = lockPath(workspaceRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as LockInfo;
}
