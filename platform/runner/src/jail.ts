import { realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

export class JailViolationError extends Error {
  constructor(public readonly attemptedPath: string) {
    super(`Path escapes workspace jail: ${attemptedPath}`);
    this.name = 'JailViolationError';
  }
}

export function resolveInJail(workspaceRoot: string, relativePath: string): string {
  const root = realpathSync(workspaceRoot);

  if (isAbsolute(relativePath)) {
    throw new JailViolationError(relativePath);
  }

  const candidate = resolve(root, relativePath);
  assertInside(root, candidate);

  const realCandidate = nearestRealPath(candidate);
  assertInside(root, realCandidate);

  return candidate;
}

function assertInside(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new JailViolationError(candidate);
  }
}

function nearestRealPath(candidate: string): string {
  let current = candidate;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return candidate;
    }
    current = parent;
  }
  const real = realpathSync(current);
  const suffix = relative(current, candidate);
  return suffix ? resolve(real, suffix) : real;
}
