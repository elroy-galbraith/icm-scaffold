import { Router } from 'express';
import { buildPipelineView } from '../pipeline.js';
import type { WorkspaceConfig } from '../workspace.js';

export function createPipelineRouter(config: WorkspaceConfig): Router {
  const router = Router();
  router.get('/api/pipeline', (_req, res) => {
    res.status(200).json(buildPipelineView(config.scratchDir));
  });
  return router;
}
