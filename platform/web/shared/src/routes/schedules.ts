import { Router } from 'express';
import type { WorkspaceRootConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';
import { readSchedules, writeSchedules, SchedulesValidationError, type ScheduleConfig } from '../schedules.js';

export function createSchedulesRouter(config: WorkspaceRootConfig): Router {
  const router = Router();

  router.get('/api/schedules', (_req, res) => {
    res.status(200).json(readSchedules(config.workspaceRoot));
  });

  router.put('/api/schedules', (req, res) => {
    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    try {
      writeSchedules(config.workspaceRoot, req.body as ScheduleConfig);
    } catch (err) {
      if (err instanceof SchedulesValidationError) {
        res.status(422).json({ error: err.message, details: err.errors });
        return;
      }
      throw err;
    }

    commitWorkspace(config.workspaceRoot, 'schedules.config.json updated');
    res.status(200).json(readSchedules(config.workspaceRoot));
  });

  return router;
}
