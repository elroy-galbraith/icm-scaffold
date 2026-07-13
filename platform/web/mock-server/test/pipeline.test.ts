import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPipelineView } from '../src/pipeline.js';
import { writeState, writeLock, writeRunLog } from 'icm-web-shared';

describe('buildPipelineView', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'pipeline-view-'));
    mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '02_analysis', 'output'), { recursive: true });
    writeState(workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z', lastRunId: 'run-1' },
        '02_analysis': { status: 'rejected', comment: 'needs more depth', updatedAt: '2026-07-12T09:05:00.000Z' },
      },
    });
    writeRunLog(workspaceRoot, {
      runId: 'run-1',
      stage: '01_research',
      model: 'anthropic/claude-sonnet-5',
      startedAt: '2026-07-12T08:59:00.000Z',
      endedAt: '2026-07-12T09:00:00.000Z',
      status: 'completed',
      filesRead: [],
      filesWritten: ['stages/01_research/output/findings.md'],
      toolCalls: [],
      tokensSpent: 800,
      tokenBudget: 200000,
      gateSummary: 'Done.',
    });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reports locked: false and no running stage when there is no lock', () => {
    const view = buildPipelineView(workspaceRoot);
    expect(view.locked).toBe(false);
    expect(view.lock ?? null).toBeNull();
    expect(view.stages.every((s) => s.running === false)).toBe(true);
  });

  it('orders stages by numeric prefix', () => {
    const view = buildPipelineView(workspaceRoot);
    expect(view.stages.map((s) => s.name)).toEqual(['01_research', '02_analysis']);
    expect(view.stages[0].status).toBe('approved');
    expect(view.stages[1].status).toBe('rejected');
    expect(view.stages[1].comment).toBe('needs more depth');
  });

  it('defaults a stage absent from state.json to pending', () => {
    mkdirSync(join(workspaceRoot, 'stages', '03_report', 'output'), { recursive: true });

    const view = buildPipelineView(workspaceRoot);
    const stage = view.stages.find((s) => s.name === '03_report');

    expect(stage).toBeDefined();
    expect(stage?.status).toBe('pending');
    expect(stage?.running).toBe(false);
    expect(stage?.lastRun ?? null).toBeNull();
  });

  it('surfaces a failed run via lastRun even though the stage reverted to pending (failure-join rule)', () => {
    writeState(workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z', lastRunId: 'run-1' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:20:00.000Z', lastRunId: 'run-3' },
      },
    });
    writeRunLog(workspaceRoot, {
      runId: 'run-3',
      stage: '02_analysis',
      model: 'anthropic/claude-sonnet-5',
      startedAt: '2026-07-12T09:15:00.000Z',
      endedAt: '2026-07-12T09:19:00.000Z',
      status: 'error',
      filesRead: [],
      filesWritten: [],
      toolCalls: [],
      tokensSpent: 4200,
      tokenBudget: 200000,
      errorMessage: 'Model returned malformed tool call; aborting after 3 retries.',
    });

    const view = buildPipelineView(workspaceRoot);
    const stage = view.stages.find((s) => s.name === '02_analysis');

    expect(stage?.status).toBe('pending');
    expect(stage?.running).toBe(false);
    expect(stage?.lastRun?.status).toBe('error');
    expect(stage?.lastRun?.errorMessage).toBe('Model returned malformed tool call; aborting after 3 retries.');
  });

  it('joins lastRun from the run log referenced by lastRunId', () => {
    const view = buildPipelineView(workspaceRoot);
    expect(view.stages[0].lastRun?.status).toBe('completed');
    expect(view.stages[0].lastRun?.tokensSpent).toBe(800);
    expect(view.stages[1].lastRun ?? null).toBeNull();
  });

  it('derives running: true only for the stage matching the lock', () => {
    writeLock(workspaceRoot, { runId: 'run-2', stage: '02_analysis', pid: 123, acquiredAt: '2026-07-12T09:10:00.000Z' });
    const view = buildPipelineView(workspaceRoot);
    expect(view.locked).toBe(true);
    expect(view.stages.find((s) => s.name === '01_research')?.running).toBe(false);
    expect(view.stages.find((s) => s.name === '02_analysis')?.running).toBe(true);
  });
});
