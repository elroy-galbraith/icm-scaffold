import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { getTree, getDiff, getLog, InvalidRefError } from '../git.js';

export function createTreeDiffLogRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/tree', (_req, res) => {
    res.status(200).json(getTree(config.scratchDir));
  });

  router.get('/api/diff', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const ref = typeof req.query.ref === 'string' ? req.query.ref : 'HEAD~1';

    if (path.length === 0) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    // Belt-and-suspenders: getDiff() enforces this too (the real security
    // boundary, since it's what shells out to git), but rejecting here
    // avoids the exception path for the common case of an obviously bad ref.
    if (ref.startsWith('-')) {
      res.status(400).json({ error: 'invalid ref' });
      return;
    }

    try {
      res.status(200).json(getDiff(config.scratchDir, path, ref));
    } catch (err) {
      if (err instanceof InvalidRefError) {
        res.status(400).json({ error: 'invalid ref' });
        return;
      }
      throw err;
    }
  });

  router.get('/api/log', (req, res) => {
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    res.status(200).json(getLog(config.scratchDir, limit));
  });

  return router;
}
