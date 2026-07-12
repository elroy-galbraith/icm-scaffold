import { commitWorkspace } from '../git.js';
import { updateStageState } from '../state.js';

export function approveCommand(workspaceRoot: string, stage: string): void {
  commitWorkspace(workspaceRoot, `stage ${stage}: approved`);
  updateStageState(workspaceRoot, stage, { status: 'approved', comment: undefined });
  console.log(`${stage}: approved`);
}
