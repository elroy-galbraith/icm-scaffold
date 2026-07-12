import { updateStageState } from '../state.js';

export function rejectCommand(workspaceRoot: string, stage: string, comment: string): void {
  updateStageState(workspaceRoot, stage, { status: 'rejected', comment });
  console.log(`${stage}: rejected — ${comment}`);
}
