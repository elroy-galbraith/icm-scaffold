import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRunLog, readLatestRunLog, type RunLog } from '../src/runLog.js';

function makeLog(overrides: Partial<RunLog>): RunLog {
  return {
    runId: 'run-1',
    stage: '01_research',
    model: 'anthropic/claude-sonnet-5',
    startedAt: '2026-07-12T10:00:00.000Z',
    endedAt: '2026-07-12T10:01:00.000Z',
    status: 'completed',
    filesRead: [],
    filesWritten: [],
    toolCalls: [],
    tokensSpent: 100,
    tokenBudget: 200000,
    ...overrides,
  };
}

describe('runLog', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'runlog-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns null when there are no runs yet', () => {
    expect(readLatestRunLog(workspaceRoot)).toBeNull();
  });

  it('writes and reads back a run log', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1' }));
    const log = readLatestRunLog(workspaceRoot);
    expect(log?.runId).toBe('run-1');
  });

  it('returns the most recent run for a stage', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1', endedAt: '2026-07-12T10:01:00.000Z' }));
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-2', endedAt: '2026-07-12T11:00:00.000Z' }));
    const log = readLatestRunLog(workspaceRoot, '01_research');
    expect(log?.runId).toBe('run-2');
  });

  it('filters by stage', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1', stage: '01_research' }));
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-2', stage: '02_analysis', endedAt: '2026-07-12T12:00:00.000Z' }));
    const log = readLatestRunLog(workspaceRoot, '01_research');
    expect(log?.runId).toBe('run-1');
  });
});
