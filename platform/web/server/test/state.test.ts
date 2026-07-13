import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readState,
  writeState,
  updateStageState,
  readLock,
  writeLock,
  clearLock,
  writeRunLog,
  readRunLog,
  SchemaValidationError,
  type RunLog,
  type LockInfo,
} from 'icm-web-shared';

function makeRunLog(overrides: Partial<RunLog> = {}): RunLog {
  return {
    runId: 'run-1',
    stage: '03_report',
    model: 'anthropic/claude-sonnet-5',
    startedAt: '2026-07-12T10:00:00.000Z',
    endedAt: '2026-07-12T10:00:03.000Z',
    status: 'completed',
    filesRead: ['shared/client-brief.md'],
    filesWritten: ['stages/03_report/output/report.md'],
    toolCalls: [
      { tool: 'read_file', args: { path: 'shared/client-brief.md' }, result: 'ok', timestamp: '2026-07-12T10:00:01.000Z' },
    ],
    tokensSpent: 500,
    tokenBudget: 200000,
    ...overrides,
  };
}

describe('state', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'state-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('starts with no stages', () => {
    expect(readState(workspaceRoot)).toEqual({ stages: {} });
  });

  it('creates a stage entry on first update', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('awaiting_review');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('preserves fields not included in the patch', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('rejects a state.json that violates the schema', () => {
    expect(() =>
      writeState(workspaceRoot, { stages: { '01_research': { status: 'bogus' as never, updatedAt: 'not-a-date' } } })
    ).toThrow(SchemaValidationError);
  });

  it('round-trips a lock file', () => {
    const lock: LockInfo = { runId: 'run-1', stage: '03_report', pid: 1234, acquiredAt: '2026-07-12T10:00:00.000Z' };
    writeLock(workspaceRoot, lock);
    expect(readLock(workspaceRoot)).toEqual(lock);
    clearLock(workspaceRoot);
    expect(readLock(workspaceRoot)).toBeNull();
  });

  it('clearing an absent lock is a no-op', () => {
    expect(() => clearLock(workspaceRoot)).not.toThrow();
  });

  it('rejects a lock missing the required "stage" field', () => {
    expect(() =>
      writeLock(workspaceRoot, { runId: 'run-1', pid: 1, acquiredAt: '2026-07-12T10:00:00.000Z' } as LockInfo)
    ).toThrow(SchemaValidationError);
  });

  it('round-trips a run log', () => {
    writeRunLog(workspaceRoot, makeRunLog());
    const log = readRunLog(workspaceRoot, 'run-1');
    expect(log?.runId).toBe('run-1');
    expect(log?.toolCalls).toHaveLength(1);
  });

  it('returns null for an unknown run id', () => {
    expect(readRunLog(workspaceRoot, 'does-not-exist')).toBeNull();
  });

  it('rejects a run log with an invalid tool name', () => {
    const bad = makeRunLog({
      toolCalls: [{ tool: 'delete_everything' as never, args: {}, result: 'ok', timestamp: '2026-07-12T10:00:01.000Z' }],
    });
    expect(() => writeRunLog(workspaceRoot, bad)).toThrow(SchemaValidationError);
  });
});
