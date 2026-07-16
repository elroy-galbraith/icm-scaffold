import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScheduler, type SchedulerHandle } from '../src/scheduler.js';
import { seedTestWorkspace } from './helpers/seedTestWorkspace.js';
import { writeSchedules, writeLock, writeState } from 'icm-web-shared';
import type { WorkspaceConfig } from '../src/workspace.js';
import type { RunnerCli } from '../src/runnerCli.js';

function fakeRunnerCli(): RunnerCli {
  return {
    runStageInBackground: vi.fn(),
    approveStage: vi.fn().mockResolvedValue(undefined),
    rejectStage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('scheduler', () => {
  let config: WorkspaceConfig;
  let handle: SchedulerHandle | undefined;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'scheduler-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    handle?.stop();
    handle = undefined;
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('triggers a due, enabled schedule via runnerCli with a schedule trigger', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).toHaveBeenCalledWith(config.workspaceRoot, '03_report', {
      type: 'schedule',
      source: 'nightly',
    });
  });

  it('does not trigger before the cron boundary is reached', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T08:59:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('does not re-fire the same boundary on the next tick', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();
    expect(runnerCli.runStageInBackground).toHaveBeenCalledTimes(1);

    now = new Date('2026-07-20T09:08:00.000Z');
    handle.tick();
    expect(runnerCli.runStageInBackground).toHaveBeenCalledTimes(1);
  });

  it('skips (does not call runnerCli) when the workspace is locked', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    writeLock(config.workspaceRoot, { runId: 'x', stage: '01_research', pid: 1, acquiredAt: '2026-07-20T08:00:00.000Z' });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('skips a schedule blocked by stage ordering, never approving/forcing past the gate', () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('never calls approve/reject — a schedule can only ever call run', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();

    expect(runnerCli.approveStage).not.toHaveBeenCalled();
    expect(runnerCli.rejectStage).not.toHaveBeenCalled();
  });

  it('does not throw on a malformed schedules.config.json, and retries the same window once it is fixed', () => {
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    // Hand-edit the file into a state writeSchedules would have rejected.
    writeFileSync(join(config.workspaceRoot, 'schedules.config.json'), JSON.stringify({ schedules: [{ id: 'x' }] }));

    now = new Date('2026-07-20T09:03:00.000Z'); // past the 09:00 boundary this schedule will have once fixed
    expect(() => handle!.tick()).not.toThrow();
    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();

    // Fix the file. lastCheckedAt should still be 08:58 (never advanced on the failed
    // tick above), so the next successful tick catches the boundary that was missed
    // while the config was broken.
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }],
    });
    now = new Date('2026-07-20T09:05:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).toHaveBeenCalledWith(config.workspaceRoot, '03_report', {
      type: 'schedule',
      source: 'nightly',
    });
  });

  it('ignores a disabled schedule', () => {
    writeSchedules(config.workspaceRoot, {
      schedules: [{ id: 'off', stage: '03_report', cron: '0 9 * * *', enabled: false }],
    });
    const runnerCli = fakeRunnerCli();
    let now = new Date('2026-07-20T08:58:00.000Z');
    handle = startScheduler(config, runnerCli, { now: () => now });

    now = new Date('2026-07-20T09:03:00.000Z');
    handle.tick();

    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });
});
