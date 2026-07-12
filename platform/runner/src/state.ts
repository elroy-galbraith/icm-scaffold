import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type StageStatus = 'pending' | 'awaiting_review' | 'approved' | 'rejected';

export interface StageState {
  status: StageStatus;
  lastRunId?: string;
  comment?: string;
  updatedAt: string;
}

export interface WorkspaceState {
  stages: Record<string, StageState>;
}

function statePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner', 'state.json');
}

export function readState(workspaceRoot: string): WorkspaceState {
  const path = statePath(workspaceRoot);
  if (!existsSync(path)) {
    return { stages: {} };
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as WorkspaceState;
}

export function writeState(workspaceRoot: string, state: WorkspaceState): void {
  const path = statePath(workspaceRoot);
  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function updateStageState(
  workspaceRoot: string,
  stage: string,
  patch: Partial<Omit<StageState, 'updatedAt'>>
): WorkspaceState {
  const state = readState(workspaceRoot);
  const existing = state.stages[stage];
  state.stages[stage] = {
    status: patch.status ?? existing?.status ?? 'pending',
    lastRunId: patch.lastRunId ?? existing?.lastRunId,
    comment: patch.comment ?? existing?.comment,
    updatedAt: new Date().toISOString(),
  };
  writeState(workspaceRoot, state);
  return state;
}
