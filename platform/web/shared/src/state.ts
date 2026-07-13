import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';

// ajv-formats ships a CommonJS default export without a "type": "module" marker in its
// package.json, which trips up TypeScript's NodeNext module resolution ("this expression
// is not callable") even though the runtime interop is correct. Re-type it explicitly.
const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;

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

export type RunStatus = 'completed' | 'aborted_budget' | 'error';

export interface ToolCallLogEntry {
  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage';
  args: Record<string, unknown>;
  result: 'ok' | 'error';
  errorMessage?: string;
  timestamp: string;
}

export interface RunLog {
  runId: string;
  stage: string;
  model: string;
  startedAt: string;
  endedAt: string;
  status: RunStatus;
  filesRead: string[];
  filesWritten: string[];
  toolCalls: ToolCallLogEntry[];
  tokensSpent: number;
  tokenBudget: number;
  gateSummary?: string;
  errorMessage?: string;
}

export interface LockInfo {
  runId: string;
  stage: string;
  pid: number;
  acquiredAt: string;
}

export class SchemaValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Schema validation failed: ${errors.join('; ')}`);
    this.name = 'SchemaValidationError';
  }
}

const SCHEMAS_DIR = fileURLToPath(new URL('../../../../contracts/schemas', import.meta.url));

function loadSchema(fileName: string): object {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, fileName), 'utf-8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

const validateWorkspaceState = ajv.compile(loadSchema('workspace-state.schema.json'));
const validateLock = ajv.compile(loadSchema('lock.schema.json'));
const validateRunLog = ajv.compile(loadSchema('run-log.schema.json'));

function assertValid(validate: (data: unknown) => boolean, data: unknown, errorsOf: () => Array<{ instancePath: string; message?: string }> | null | undefined): void {
  if (!validate(data)) {
    const errors = (errorsOf() ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim());
    throw new SchemaValidationError(errors);
  }
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
  assertValid(validateWorkspaceState, state, () => validateWorkspaceState.errors);
  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(statePath(workspaceRoot), JSON.stringify(state, null, 2));
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

function lockPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner.lock');
}

export function readLock(workspaceRoot: string): LockInfo | null {
  const path = lockPath(workspaceRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as LockInfo;
}

export function writeLock(workspaceRoot: string, lock: LockInfo): void {
  assertValid(validateLock, lock, () => validateLock.errors);
  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(lockPath(workspaceRoot), JSON.stringify(lock, null, 2));
}

export function clearLock(workspaceRoot: string): void {
  const path = lockPath(workspaceRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function runLogPath(workspaceRoot: string, runId: string): string {
  return join(workspaceRoot, '.runner', 'runs', `${runId}.json`);
}

export function writeRunLog(workspaceRoot: string, log: RunLog): void {
  assertValid(validateRunLog, log, () => validateRunLog.errors);
  mkdirSync(join(workspaceRoot, '.runner', 'runs'), { recursive: true });
  writeFileSync(runLogPath(workspaceRoot, log.runId), JSON.stringify(log, null, 2));
}

export function readRunLog(workspaceRoot: string, runId: string): RunLog | null {
  const path = runLogPath(workspaceRoot, runId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as RunLog;
}
