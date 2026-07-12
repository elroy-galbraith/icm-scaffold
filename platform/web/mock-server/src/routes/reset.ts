import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { seedWorkspace } from '../workspace.js';

export function createResetRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.post('/api/_reset', (_req, res) => {
    seedWorkspace(config);
    res.status(200).json({});
  });

  return router;
}
