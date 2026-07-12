import { Router } from 'express';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import type { WorkspaceConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';

class PathEscapesWorkspaceError extends Error {}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new PathEscapesWorkspaceError(relativePath);
  }
  const candidate = resolve(workspaceRoot, relativePath);
  const rel = relative(workspaceRoot, candidate);
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new PathEscapesWorkspaceError(relativePath);
  }
  return candidate;
}

function isRunnerPath(relativePath: string): boolean {
  return relativePath === '.runner' || relativePath === '.runner.lock' || relativePath.startsWith('.runner/');
}

export function createFilesRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    let resolved: string;
    try {
      resolved = resolveWorkspacePath(config.scratchDir, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ path, content: readFileSync(resolved, 'utf-8') });
  });

  router.put('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : undefined;
    if (content === undefined) {
      res.status(422).json({ error: 'content is required' });
      return;
    }

    let resolved: string;
    try {
      resolved = resolveWorkspacePath(config.scratchDir, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (isRunnerPath(path)) {
      res.status(403).json({ error: '.runner/ is read-only via the API' });
      return;
    }

    const lock = readLock(config.scratchDir);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, content, 'utf-8');
    commitWorkspace(config.scratchDir, `human edit: ${path}`);
    res.status(200).json({});
  });

  return router;
}
