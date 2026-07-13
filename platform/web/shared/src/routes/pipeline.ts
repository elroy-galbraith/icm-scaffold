import { Router } from 'express';
import { buildPipelineView } from '../pipeline.js';
import type { WorkspaceRootConfig } from '../workspace.js';

export function createPipelineRouter(config: WorkspaceRootConfig): Router {
  const router = Router();
  router.get('/api/pipeline', (_req, res) => {
    res.status(200).json(buildPipelineView(config.workspaceRoot));
  });
  return router;
}
