import { execFileSync } from 'node:child_process';

export function commitWorkspace(workspaceRoot: string, message: string): string {
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
  if (status.trim().length === 0) {
    return currentHead(workspaceRoot);
  }
  execFileSync('git', ['commit', '-m', message], { cwd: workspaceRoot });
  return currentHead(workspaceRoot);
}

export function currentHead(workspaceRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
}
