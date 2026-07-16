import { Router } from 'express';
import { readChannels, authenticateChannel, STAGE_NAME_PATTERN, type ChannelAction } from 'icm-web-shared';
import type { WorkspaceConfig } from '../workspace.js';
import { defaultRunnerCli, type RunnerCli } from '../runnerCli.js';
import { performRunStage, performApproveStage, performRejectStage, performStatus, sendActionResult } from '../actions.js';

const VALID_ACTIONS: ChannelAction[] = ['run', 'status', 'approve', 'reject'];

function bearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined;
  const [scheme, token] = authorizationHeader.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}

/**
 * A channel is an authenticated adapter in front of the exact same actions the stage
 * routes expose (see contracts/README.md "Schedules & channels"). It cannot do anything
 * a human in the web UI couldn't already do, and it can never bypass a gate — approve/
 * reject still requires the stage to be awaiting_review, same as the UI button.
 */
export function createChannelActionsRouter(
  config: WorkspaceConfig,
  options: { runnerCli?: RunnerCli } = {}
): Router {
  const router = Router();
  const runnerCli = options.runnerCli ?? defaultRunnerCli;

  router.post('/api/channels/:channelId/actions', async (req, res) => {
    const { channelId } = req.params;
    const channels = readChannels(config.workspaceRoot);
    const providedToken = bearerToken(req.header('authorization'));
    const channel = authenticateChannel(channels, channelId, providedToken);

    if (!channel) {
      const channelExists = channels.channels.some((c) => c.id === channelId);
      if (!channelExists) {
        res.status(404).json({ error: 'Unknown channel' });
        return;
      }
      res.status(401).json({ error: 'Missing or invalid bearer token' });
      return;
    }

    const action = req.body?.action as ChannelAction | undefined;
    if (!action || !VALID_ACTIONS.includes(action)) {
      res.status(422).json({ error: 'action must be one of: run, status, approve, reject' });
      return;
    }

    if (!channel.allowedActions.includes(action)) {
      res.status(403).json({ error: `channel "${channelId}" is not permitted to perform "${action}"` });
      return;
    }

    if (action === 'status') {
      sendActionResult(res, performStatus(config));
      return;
    }

    const stage = typeof req.body?.stage === 'string' ? req.body.stage : undefined;
    if (!stage || !STAGE_NAME_PATTERN.test(stage)) {
      res.status(422).json({ error: `stage is required and must be a valid stage name for action "${action}"` });
      return;
    }

    const trigger = { type: 'channel' as const, source: channelId };

    if (action === 'run') {
      sendActionResult(res, performRunStage(config, runnerCli, stage, trigger));
      return;
    }
    if (action === 'approve') {
      sendActionResult(res, await performApproveStage(config, runnerCli, stage));
      return;
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    sendActionResult(res, await performRejectStage(config, runnerCli, stage, comment));
  });

  return router;
}
