import { listStageNames } from './workspace.js';
import { readState, readLock, readRunLog, type StageStatus, type RunStatus, type LockInfo } from './state.js';

export interface LastRunSummary {
  runId: string;
  status: RunStatus;
  endedAt: string;
  tokensSpent: number;
  tokenBudget: number;
  gateSummary?: string;
  errorMessage?: string;
}

export interface StageView {
  name: string;
  status: StageStatus;
  running: boolean;
  comment?: string;
  lastRun?: LastRunSummary | null;
}

export interface PipelineView {
  locked: boolean;
  lock?: LockInfo | null;
  stages: StageView[];
}

export function buildPipelineView(workspaceRoot: string): PipelineView {
  const state = readState(workspaceRoot);
  const lock = readLock(workspaceRoot);
  const stageNames = listStageNames(workspaceRoot);

  const stages: StageView[] = stageNames.map((name) => {
    const stageState = state.stages[name];
    const status: StageStatus = stageState?.status ?? 'pending';
    const running = lock !== null && lock.stage === name;

    let lastRun: LastRunSummary | null = null;
    if (stageState?.lastRunId) {
      const log = readRunLog(workspaceRoot, stageState.lastRunId);
      if (log) {
        lastRun = {
          runId: log.runId,
          status: log.status,
          endedAt: log.endedAt,
          tokensSpent: log.tokensSpent,
          tokenBudget: log.tokenBudget,
          gateSummary: log.gateSummary,
          errorMessage: log.errorMessage,
        };
      }
    }

    return { name, status, running, comment: stageState?.comment, lastRun };
  });

  return { locked: lock !== null, lock, stages };
}
