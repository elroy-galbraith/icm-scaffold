import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { registerStageNameGuard } from 'icm-web-shared';
import { defaultRunnerCli, type RunnerCli } from '../runnerCli.js';
import { performRunStage, performApproveStage, performRejectStage, sendActionResult } from '../actions.js';

export function createStageActionsRouter(
  config: WorkspaceConfig,
  options: { runnerCli?: RunnerCli } = {}
): Router {
  const router = Router();
  const runnerCli = options.runnerCli ?? defaultRunnerCli;

  registerStageNameGuard(router);

  router.post('/api/stages/:stage/run', (req, res) => {
    sendActionResult(res, performRunStage(config, runnerCli, req.params.stage));
  });

  router.post('/api/stages/:stage/approve', async (req, res) => {
    sendActionResult(res, await performApproveStage(config, runnerCli, req.params.stage));
  });

  router.post('/api/stages/:stage/reject', async (req, res) => {
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    sendActionResult(res, await performRejectStage(config, runnerCli, req.params.stage, comment));
  });

  return router;
}
