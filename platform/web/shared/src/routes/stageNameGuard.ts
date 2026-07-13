import type { Router } from 'express';
import { STAGE_NAME_PATTERN } from '../workspace.js';

// Reject any :stage that doesn't match the contract's stage-name pattern before it can
// reach a filesystem operation or a state.json object key.
export function registerStageNameGuard(router: Router): void {
  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });
}
