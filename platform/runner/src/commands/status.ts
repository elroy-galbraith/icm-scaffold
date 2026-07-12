import { readState } from '../state.js';
import { readLatestRunLog } from '../runLog.js';

export function statusCommand(workspaceRoot: string): void {
  const state = readState(workspaceRoot);
  const stages = Object.keys(state.stages);

  if (stages.length === 0) {
    console.log('No runs recorded yet.');
    return;
  }

  for (const stage of stages.sort()) {
    const stageState = state.stages[stage];
    const log = readLatestRunLog(workspaceRoot, stage);
    const suffix = log ? ` (last run ${log.runId}, ${log.tokensSpent} tokens)` : '';
    console.log(`${stage}: ${stageState.status}${suffix}`);
    if (stageState.comment) {
      console.log(`  comment: ${stageState.comment}`);
    }
  }
}
