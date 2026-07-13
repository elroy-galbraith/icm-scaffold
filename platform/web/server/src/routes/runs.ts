import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { readRunLog } from 'icm-web-shared';

// Run IDs are always server-generated via randomUUID(). Rejecting anything else
// before it reaches readRunLog's join() closes a directory-traversal read (e.g.
// runId=..%2Fstate resolves to .runner/state.json instead of a run log).
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRunsRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.param('runId', (req, res, next, runId) => {
    if (!RUN_ID_PATTERN.test(runId)) {
      res.status(400).json({ error: 'Invalid runId' });
      return;
    }
    next();
  });

  router.get('/api/runs/:runId', (req, res) => {
    const log = readRunLog(config.workspaceRoot, req.params.runId);
    if (!log) {
      res.status(404).json({ error: 'Unknown run' });
      return;
    }
    res.status(200).json(log);
  });

  return router;
}
