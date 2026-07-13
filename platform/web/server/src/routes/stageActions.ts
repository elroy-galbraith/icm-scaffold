import { Router } from 'express';
import { STAGE_NAME_PATTERN, checkStageOrder, type WorkspaceConfig } from '../workspace.js';
import { readState, readLock, type StageStatus } from 'icm-web-shared';
import { defaultRunnerCli, type RunnerCli } from '../runnerCli.js';
import { commitWorkspace } from '../git.js';

function getStageStatus(config: WorkspaceConfig, stage: string): StageStatus {
  const state = readState(config.workspaceRoot);
  return state.stages[stage]?.status ?? 'pending';
}

export function createStageActionsRouter(
  config: WorkspaceConfig,
  options: { runnerCli?: RunnerCli } = {}
): Router {
  const router = Router();
  const runnerCli = options.runnerCli ?? defaultRunnerCli;

  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });

  router.post('/api/stages/:stage/run', (req, res) => {
    const { stage } = req.params;

    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    const currentStatus = getStageStatus(config, stage);
    if (currentStatus === 'awaiting_review') {
      res.status(422).json({ blockingStage: stage, blockingStatus: currentStatus });
      return;
    }

    const blocked = checkStageOrder(config.workspaceRoot, stage);
    if (blocked) {
      res.status(422).json({ blockingStage: blocked.blockingStage, blockingStatus: blocked.blockingStatus });
      return;
    }

    runnerCli.runStageInBackground(config.workspaceRoot, stage);
    res.status(202).end();
  });

  router.post('/api/stages/:stage/approve', async (req, res) => {
    const { stage } = req.params;
    const currentStatus = getStageStatus(config, stage);
    if (currentStatus !== 'awaiting_review') {
      res.status(409).json({ stage, status: currentStatus });
      return;
    }
    try {
      await runnerCli.approveStage(config.workspaceRoot, stage);
      // The runner CLI's own commit runs before it updates .runner/state.json, so it
      // commits nothing; compensate here so the approval actually lands in the audit
      // trail (contracts/openapi.yaml: 200 means "state committed"). This is a no-op
      // if the CLI ever fixes its ordering and commits the change itself.
      commitWorkspace(config.workspaceRoot, `stage ${stage}: approved`);
      res.status(200).json({});
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/api/stages/:stage/reject', async (req, res) => {
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
    try {
      await runnerCli.rejectStage(config.workspaceRoot, stage, comment);
      // The runner CLI's own reject command never commits at all; compensate here so
      // the rejection actually lands in the audit trail (contracts/openapi.yaml: 200
      // means "comment stored"). This is a no-op if the CLI ever starts committing
      // the change itself.
      commitWorkspace(config.workspaceRoot, `stage ${stage}: rejected — ${comment}`);
      res.status(200).json({});
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
