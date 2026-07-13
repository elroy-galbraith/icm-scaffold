import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  checkStageOrdering,
  beginStageRun,
  completeStageRun,
  StageBlockedError,
  StageLockedError,
  DEFAULT_SIMULATED_DELAY_MS,
} from '../src/simulate.js';
import { readState, readLock, writeState, writeLock, readRunLog } from 'icm-web-shared';

function initGitRepo(dir: string): void {
  execFileSync('git', ['init'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: dir });
}

describe('simulate', () => {
  let workspaceRoot: string;
  let fixtureDir: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'sim-ws-'));
    fixtureDir = mkdtempSync(join(tmpdir(), 'sim-fixture-'));

    mkdirSync(join(fixtureDir, 'stages', '03_report', 'output'), { recursive: true });
    writeFileSync(join(fixtureDir, 'stages', '03_report', 'output', 'report.md'), '# Report\n\nDone.\n');

    mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '02_analysis', 'output'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '03_report', 'output'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n');
    writeFileSync(join(workspaceRoot, 'stages', '02_analysis', 'output', 'insights.md'), '# Insights\n');

    writeState(workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    initGitRepo(workspaceRoot);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('checkStageOrdering returns null when every lower stage is approved', () => {
    expect(checkStageOrdering(workspaceRoot, '03_report')).toBeNull();
  });

  it('checkStageOrdering names the first non-approved lower stage', () => {
    writeState(workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    expect(checkStageOrdering(workspaceRoot, '03_report')).toEqual({
      blockingStage: '02_analysis',
      blockingStatus: 'pending',
    });
  });

  it('beginStageRun throws StageBlockedError when ordering is violated', () => {
    writeState(workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'rejected', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    expect(() => beginStageRun(workspaceRoot, '03_report')).toThrow(StageBlockedError);
  });

  it('beginStageRun throws StageLockedError when a run is already in progress', () => {
    writeLock(workspaceRoot, { runId: 'other-run', stage: '01_research', pid: 999, acquiredAt: '2026-07-12T09:00:00.000Z' });
    expect(() => beginStageRun(workspaceRoot, '03_report')).toThrow(StageLockedError);
  });

  it('beginStageRun acquires the lock synchronously and returns a runId', () => {
    const { runId } = beginStageRun(workspaceRoot, '03_report');
    expect(typeof runId).toBe('string');
    const lock = readLock(workspaceRoot);
    expect(lock?.runId).toBe(runId);
    expect(lock?.stage).toBe('03_report');
  });

  it('completeStageRun copies pre-baked output, writes a run log, updates state, commits, and releases the lock', async () => {
    const { runId } = beginStageRun(workspaceRoot, '03_report');

    await completeStageRun({ workspaceRoot, fixtureDir, stage: '03_report', runId, delayMs: 5 });

    expect(existsSync(join(workspaceRoot, 'stages/03_report/output/report.md'))).toBe(true);
    expect(readFileSync(join(workspaceRoot, 'stages/03_report/output/report.md'), 'utf-8')).toContain('Done');

    const state = readState(workspaceRoot);
    expect(state.stages['03_report'].status).toBe('awaiting_review');
    expect(state.stages['03_report'].lastRunId).toBe(runId);

    const log = readRunLog(workspaceRoot, runId);
    expect(log?.status).toBe('completed');
    expect(log?.filesWritten).toContain('stages/03_report/output/report.md');
    expect(log?.toolCalls.length).toBeGreaterThan(0);

    expect(readLock(workspaceRoot)).toBeNull();

    const commitLog = execFileSync('git', ['log', '--oneline'], { cwd: workspaceRoot }).toString().trim().split('\n');
    expect(commitLog.length).toBeGreaterThan(1);
  });

  it('uses DEFAULT_SIMULATED_DELAY_MS when delayMs is not provided', () => {
    expect(DEFAULT_SIMULATED_DELAY_MS).toBe(3000);
  });

  it('completeStageRun writes an error run log and leaves the stage pending when the fixture output is missing', async () => {
    const { runId } = beginStageRun(workspaceRoot, '03_report');

    await completeStageRun({
      workspaceRoot,
      fixtureDir: join(fixtureDir, 'does-not-exist'),
      stage: '03_report',
      runId,
      delayMs: 5,
    });

    const state = readState(workspaceRoot);
    expect(state.stages['03_report'].status).toBe('pending');

    const log = readRunLog(workspaceRoot, runId);
    expect(log?.status).toBe('error');
    expect(log?.errorMessage).toBeTruthy();

    expect(readLock(workspaceRoot)).toBeNull();
  });
});
