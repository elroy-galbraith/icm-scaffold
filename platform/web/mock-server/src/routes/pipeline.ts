import { Router } from 'express';
import { buildPipelineView } from 'icm-web-shared';
import type { WorkspaceConfig } from '../workspace.js';

export function createPipelineRouter(config: WorkspaceConfig): Router {
  const router = Router();
  router.get('/api/pipeline', (_req, res) => {
    res.status(200).json(buildPipelineView(config.scratchDir));
  });
  return router;
}
