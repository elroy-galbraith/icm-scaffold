import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { readRunLog } from '../state.js';

export function createRunsRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/runs/:runId', (req, res) => {
    const log = readRunLog(config.scratchDir, req.params.runId);
    if (!log) {
      res.status(404).json({ error: 'Unknown run' });
      return;
    }
    res.status(200).json(log);
  });

  return router;
}
