import { Router } from 'express';
import type { WorkspaceRootConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';
import { readChannels, writeChannels, ChannelsValidationError, type ChannelConfig } from '../channels.js';

export function createChannelsRouter(config: WorkspaceRootConfig): Router {
  const router = Router();

  router.get('/api/channels', (_req, res) => {
    res.status(200).json(readChannels(config.workspaceRoot));
  });

  router.put('/api/channels', (req, res) => {
    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    try {
      writeChannels(config.workspaceRoot, req.body as ChannelConfig);
    } catch (err) {
      if (err instanceof ChannelsValidationError) {
        res.status(422).json({ error: err.message, details: err.errors });
        return;
      }
      throw err;
    }

    commitWorkspace(config.workspaceRoot, 'channels.config.json updated');
    res.status(200).json(readChannels(config.workspaceRoot));
  });

  return router;
}
