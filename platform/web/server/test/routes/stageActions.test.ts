import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createStageActionsRouter } from '../../src/routes/stageActions.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import { writeState, writeLock } from '../../src/state.js';
import type { WorkspaceConfig } from '../../src/workspace.js';
import type { RunnerCli } from '../../src/runnerCli.js';

function fakeRunnerCli(): RunnerCli {
  return {
    runStageInBackground: vi.fn(),
    approveStage: vi.fn().mockResolvedValue(undefined),
    rejectStage: vi.fn().mockResolvedValue(undefined),
  };
}

function buildApp(config: WorkspaceConfig, runnerCli: RunnerCli) {
  const app = express();
  app.use(express.json());
  app.use(createStageActionsRouter(config, { runnerCli }));
  return app;
}

describe('stage action routes', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-stage-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('POST run returns 202 and delegates to runnerCli.runStageInBackground', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(202);
    expect(runnerCli.runStageInBackground).toHaveBeenCalledWith(config.workspaceRoot, '03_report');
  });

  it('POST run returns 409 with the lock holder when the workspace is already locked', async () => {
    writeLock(config.workspaceRoot, { runId: 'other', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(409);
    expect(res.body.runId).toBe('other');
    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('POST run returns 422 naming the blocking stage when ordering is violated', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(422);
    expect(res.body.blockingStage).toBe('02_analysis');
    expect(res.body.blockingStatus).toBe('pending');
    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('POST run returns 422 when the target stage is already awaiting_review', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z', lastRunId: 'seed-run' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(422);
    expect(res.body.blockingStage).toBe('03_report');
    expect(res.body.blockingStatus).toBe('awaiting_review');
  });

  it('POST approve calls runnerCli.approveStage when awaiting_review, and returns 200', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/02_analysis/approve');

    expect(res.status).toBe(200);
    expect(runnerCli.approveStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis');
  });

  it('POST approve returns 409 without calling the CLI when the stage is not awaiting_review', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/01_research/approve');

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('approved');
    expect(runnerCli.approveStage).not.toHaveBeenCalled();
  });

  it('POST reject requires a non-empty comment and calls runnerCli.rejectStage', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const empty = await request(app).post('/api/stages/02_analysis/reject').send({ comment: '' });
    expect(empty.status).toBe(422);
    expect(runnerCli.rejectStage).not.toHaveBeenCalled();

    const res = await request(app).post('/api/stages/02_analysis/reject').send({ comment: 'too shallow' });
    expect(res.status).toBe(200);
    expect(runnerCli.rejectStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis', 'too shallow');
  });

  it('rejects a :stage that does not match the stage-name pattern, for run/approve/reject alike', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const runRes = await request(app).post('/api/stages/..%2F..%2Fetc/run');
    expect(runRes.status).toBe(400);

    const approveRes = await request(app).post('/api/stages/not-a-stage/approve');
    expect(approveRes.status).toBe(400);

    const rejectRes = await request(app).post('/api/stages/not-a-stage/reject').send({ comment: 'x' });
    expect(rejectRes.status).toBe(400);
  });

  it('POST approve returns 500 when the CLI rejects', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli: RunnerCli = {
      runStageInBackground: vi.fn(),
      approveStage: vi.fn().mockRejectedValue(new Error('git commit failed')),
      rejectStage: vi.fn(),
    };
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/02_analysis/approve');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('git commit failed');
  });
});
