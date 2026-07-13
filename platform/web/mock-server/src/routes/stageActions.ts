import { Router } from 'express';
import { STAGE_NAME_PATTERN, type WorkspaceConfig } from '../workspace.js';
import { beginStageRun, completeStageRun, StageBlockedError, StageLockedError } from '../simulate.js';
import { readState, updateStageState, type StageStatus } from 'icm-web-shared';
import { commitWorkspace } from '../git.js';

function getStageStatus(config: WorkspaceConfig, stage: string): StageStatus {
  const state = readState(config.scratchDir);
  return state.stages[stage]?.status ?? 'pending';
}

export function createStageActionsRouter(config: WorkspaceConfig, options: { runDelayMs?: number } = {}): Router {
  const router = Router();

  // Reject any :stage that doesn't match the contract's stage-name pattern before it can
  // reach a filesystem operation (completeStageRun's cpSync) or a state.json object key.
  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });

  router.post('/api/stages/:stage/run', (req, res) => {
    const { stage } = req.params;
    try {
      const currentStatus = getStageStatus(config, stage);
      if (currentStatus === 'awaiting_review') {
        res.status(422).json({ blockingStage: stage, blockingStatus: currentStatus });
        return;
      }
      const { runId } = beginStageRun(config.scratchDir, stage);
      void completeStageRun({
        workspaceRoot: config.scratchDir,
        fixtureDir: config.fixtureDir,
        stage,
        runId,
        delayMs: options.runDelayMs,
      });
      res.status(202).end();
    } catch (err) {
      if (err instanceof StageBlockedError) {
        res.status(422).json({ blockingStage: err.blockingStage, blockingStatus: err.blockingStatus });
        return;
      }
      if (err instanceof StageLockedError) {
        res.status(409).json({ runId: err.lock.runId, stage: err.lock.stage, acquiredAt: err.lock.acquiredAt });
        return;
      }
      throw err;
    }
  });

  router.post('/api/stages/:stage/approve', (req, res) => {
    const { stage } = req.params;
    const currentStatus = getStageStatus(config, stage);
    if (currentStatus !== 'awaiting_review') {
      res.status(409).json({ stage, status: currentStatus });
      return;
    }
    updateStageState(config.scratchDir, stage, { status: 'approved' });
    commitWorkspace(config.scratchDir, `Approve ${stage}`);
    res.status(200).json({});
  });

  router.post('/api/stages/:stage/reject', (req, res) => {
    const { stage } = req.params;
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    if (comment.length < 1) {
      res.status(422).json({ error: 'comment is required' });
      return;
    }
    const currentStatus = getStageStatus(config, stage);
    if (currentStatus !== 'awaiting_review') {
      res.status(409).json({ stage, status: currentStatus });
      return;
    }
    updateStageState(config.scratchDir, stage, { status: 'rejected', comment });
    commitWorkspace(config.scratchDir, `Reject ${stage}: ${comment}`);
    res.status(200).json({});
  });

  return router;
}
