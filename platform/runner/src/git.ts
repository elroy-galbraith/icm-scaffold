import { execFileSync } from 'node:child_process';

export function commitWorkspace(workspaceRoot: string, message: string): string {
  // Exclude the runner's own control-plane bookkeeping (.runner.lock, .runner/) from the
  // audit-trail commit. These are transient runner state, not workspace content, and must
  // never be tracked regardless of whether the workspace has its own .gitignore.
  execFileSync('git', ['add', '-A', '--', '.', ':!.runner.lock', ':!.runner'], { cwd: workspaceRoot });
  // Check staged changes only (not `git status --porcelain`, which would also report
  // the excluded .runner.lock/.runner/ paths as untracked and trigger a doomed commit
  // with nothing actually staged).
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: workspaceRoot }).toString();
  if (staged.trim().length === 0) {
    return currentHead(workspaceRoot);
  }
  execFileSync('git', ['commit', '-m', message], { cwd: workspaceRoot });
  return currentHead(workspaceRoot);
}

export function currentHead(workspaceRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
}
