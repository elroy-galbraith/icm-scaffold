import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from './state.js';

export interface StageBlock {
  blockingStage: string;
  blockingStatus: string;
}

export function discoverStages(workspaceRoot: string): string[] {
  return readdirSync(join(workspaceRoot, 'stages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9]{2}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null {
  const state = readState(workspaceRoot);
  for (const candidate of discoverStages(workspaceRoot)) {
    if (candidate >= stage) break;
    const status = state.stages[candidate]?.status ?? 'pending';
    if (status !== 'approved') {
      return { blockingStage: candidate, blockingStatus: status };
    }
  }
  return null;
}
