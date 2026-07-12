import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { listStageNames } from './workspace.js';
import {
  readState,
  readLock,
  writeLock,
  clearLock,
  updateStageState,
  writeRunLog,
  type StageStatus,
  type LockInfo,
  type RunLog,
  type ToolCallLogEntry,
} from './state.js';
import { commitWorkspace } from './git.js';

export const SIMULATED_MODEL = 'anthropic/claude-sonnet-5';
export const SIMULATED_TOKEN_BUDGET = 200_000;
export const DEFAULT_SIMULATED_DELAY_MS = 3000;

export class StageBlockedError extends Error {
  constructor(public readonly blockingStage: string, public readonly blockingStatus: StageStatus) {
    super(`Blocked: ${blockingStage} is ${blockingStatus}, must be approved first.`);
    this.name = 'StageBlockedError';
  }
}

export class StageLockedError extends Error {
  constructor(public readonly lock: LockInfo) {
    super(`Workspace is locked by run ${lock.runId} (stage ${lock.stage}) since ${lock.acquiredAt}`);
    this.name = 'StageLockedError';
  }
}

export function checkStageOrdering(
  workspaceRoot: string,
  stage: string
): { blockingStage: string; blockingStatus: StageStatus } | null {
  const allStages = listStageNames(workspaceRoot);
  const state = readState(workspaceRoot);
  for (const name of allStages) {
    if (name >= stage) break;
    const status = state.stages[name]?.status ?? 'pending';
    if (status !== 'approved') {
      return { blockingStage: name, blockingStatus: status };
    }
  }
  return null;
}

export function beginStageRun(workspaceRoot: string, stage: string): { runId: string } {
  const blocked = checkStageOrdering(workspaceRoot, stage);
  if (blocked) {
    throw new StageBlockedError(blocked.blockingStage, blocked.blockingStatus);
  }

  const existingLock = readLock(workspaceRoot);
  if (existingLock) {
    throw new StageLockedError(existingLock);
  }

  const runId = randomUUID();
  writeLock(workspaceRoot, {
    runId,
    stage,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  });
  return { runId };
}

export interface CompleteStageRunParams {
  workspaceRoot: string;
  fixtureDir: string;
  stage: string;
  runId: string;
  delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listFilesRelative(dir: string, root: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => relative(root, join(dir, name)).split(sep).join('/'))
    .sort();
}

function collectFilesRead(workspaceRoot: string, allStages: string[], stage: string): string[] {
  const files: string[] = [];
  for (const dir of ['shared', '_config']) {
    files.push(...listFilesRelative(join(workspaceRoot, dir), workspaceRoot));
  }
  for (const name of allStages) {
    if (name >= stage) break;
    files.push(...listFilesRelative(join(workspaceRoot, 'stages', name, 'output'), workspaceRoot));
  }
  return files;
}

export async function completeStageRun(params: CompleteStageRunParams): Promise<void> {
  const { workspaceRoot, fixtureDir, stage, runId } = params;
  const delayMs = params.delayMs ?? DEFAULT_SIMULATED_DELAY_MS;
  const startedAt = new Date().toISOString();

  try {
    await sleep(delayMs);

    const sourceOutputDir = join(fixtureDir, 'stages', stage, 'output');
    if (!existsSync(sourceOutputDir)) {
      throw new Error(`No pre-baked output found for stage ${stage} at ${sourceOutputDir}`);
    }

    const targetOutputDir = join(workspaceRoot, 'stages', stage, 'output');
    cpSync(sourceOutputDir, targetOutputDir, { recursive: true });

    const allStages = listStageNames(workspaceRoot);
    const filesRead = collectFilesRead(workspaceRoot, allStages, stage);
    const filesWritten = listFilesRelative(targetOutputDir, workspaceRoot);

    const timestamp = new Date().toISOString();
    const toolCalls: ToolCallLogEntry[] = [
      ...filesRead.map((path): ToolCallLogEntry => ({ tool: 'read_file', args: { path }, result: 'ok', timestamp })),
      ...filesWritten.map((path): ToolCallLogEntry => ({ tool: 'write_file', args: { path }, result: 'ok', timestamp })),
    ];
    const gateSummary = `Completed ${stage}. Wrote ${filesWritten.length} output file(s). Verify: outputs are non-empty and match the stage contract.`;
    toolCalls.push({ tool: 'finish_stage', args: { gateSummary }, result: 'ok', timestamp });

    const endedAt = new Date().toISOString();
    const tokensSpent = 500 + filesWritten.length * 300;

    const log: RunLog = {
      runId,
      stage,
      model: SIMULATED_MODEL,
      startedAt,
      endedAt,
      status: 'completed',
      filesRead,
      filesWritten,
      toolCalls,
      tokensSpent,
      tokenBudget: SIMULATED_TOKEN_BUDGET,
      gateSummary,
    };
    writeRunLog(workspaceRoot, log);
    updateStageState(workspaceRoot, stage, { status: 'awaiting_review', lastRunId: runId });
    commitWorkspace(workspaceRoot, `Run ${stage} (run ${runId})`);
  } catch (err) {
    const endedAt = new Date().toISOString();
    const errorMessage = err instanceof Error ? err.message : String(err);
    const log: RunLog = {
      runId,
      stage,
      model: SIMULATED_MODEL,
      startedAt,
      endedAt,
      status: 'error',
      filesRead: [],
      filesWritten: [],
      toolCalls: [],
      tokensSpent: 0,
      tokenBudget: SIMULATED_TOKEN_BUDGET,
      errorMessage,
    };
    writeRunLog(workspaceRoot, log);
    updateStageState(workspaceRoot, stage, { status: 'pending', lastRunId: runId });
  } finally {
    clearLock(workspaceRoot);
  }
}
