import { Router } from 'express';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import type { WorkspaceConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';

class PathEscapesWorkspaceError extends Error {}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): { absolute: string; relative: string } {
  const root = realpathSync(workspaceRoot);

  if (isAbsolute(relativePath)) {
    throw new PathEscapesWorkspaceError(relativePath);
  }

  const candidate = resolve(root, relativePath);
  assertInsideRoot(root, candidate, relativePath);

  const realCandidate = nearestRealPath(candidate);
  assertInsideRoot(root, realCandidate, relativePath);

  return { absolute: candidate, relative: relative(root, candidate) };
}

function assertInsideRoot(root: string, candidate: string, originalPath: string): void {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PathEscapesWorkspaceError(originalPath);
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

function isRunnerPath(workspaceRelativePath: string): boolean {
  const firstSegment = workspaceRelativePath.split(sep)[0];
  return firstSegment === '.runner' || workspaceRelativePath === '.runner.lock';
}

export function createFilesRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    let resolved: { absolute: string; relative: string };
    try {
      resolved = resolveWorkspacePath(config.workspaceRoot, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (!existsSync(resolved.absolute) || statSync(resolved.absolute).isDirectory()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ path, content: readFileSync(resolved.absolute, 'utf-8') });
  });

  router.put('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : undefined;
    if (content === undefined) {
      res.status(422).json({ error: 'content is required' });
      return;
    }

    let resolved: { absolute: string; relative: string };
    try {
      resolved = resolveWorkspacePath(config.workspaceRoot, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (isRunnerPath(resolved.relative)) {
      res.status(403).json({ error: '.runner/ is read-only via the API' });
      return;
    }

    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    mkdirSync(dirname(resolved.absolute), { recursive: true });
    writeFileSync(resolved.absolute, content, 'utf-8');
    commitWorkspace(config.workspaceRoot, `human edit: ${path}`);
    res.status(200).json({});
  });

  return router;
}
