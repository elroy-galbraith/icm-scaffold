import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { getTree, getDiff, getLog } from '../git.js';

export function createTreeDiffLogRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/tree', (_req, res) => {
    res.status(200).json(getTree(config.scratchDir));
  });

  router.get('/api/diff', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const ref = typeof req.query.ref === 'string' ? req.query.ref : 'HEAD~1';
    res.status(200).json(getDiff(config.scratchDir, path, ref));
  });

  router.get('/api/log', (req, res) => {
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    res.status(200).json(getLog(config.scratchDir, limit));
  });

  return router;
}
