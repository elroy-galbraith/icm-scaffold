import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createChannelActionsRouter } from '../../src/routes/channelActions.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import { writeChannels, writeState, writeLock } from 'icm-web-shared';
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
  app.use(createChannelActionsRouter(config, { runnerCli }));
  return app;
}

describe('channel action route', () => {
  let config: WorkspaceConfig;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-channel-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
    process.env.TEST_CHANNEL_TOKEN = 'sekret-token';
    writeChannels(config.workspaceRoot, {
      channels: [
        { id: 'ops-bot', kind: 'http', tokenEnvVar: 'TEST_CHANNEL_TOKEN', allowedActions: ['run', 'status', 'approve', 'reject'], enabled: true },
        { id: 'status-only', kind: 'http', tokenEnvVar: 'TEST_CHANNEL_TOKEN', allowedActions: ['status'], enabled: true },
        { id: 'off', kind: 'http', tokenEnvVar: 'TEST_CHANNEL_TOKEN', allowedActions: ['status'], enabled: false },
      ],
    });
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('returns 404 for an unknown channel', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/nope/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'status' });
    expect(res.status).toBe(404);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app).post('/api/channels/ops-bot/actions').send({ action: 'status' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with the wrong token', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer wrong')
      .send({ action: 'status' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a disabled channel even with the right token', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/off/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'status' });
    expect(res.status).toBe(401);
  });

  it('returns 422 for an unknown action', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'launch_missiles' });
    expect(res.status).toBe(422);
  });

  it('returns 403 when the action is not in allowedActions', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/status-only/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'run', stage: '03_report' });
    expect(res.status).toBe(403);
  });

  it('status action returns the pipeline view and needs no stage', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/status-only/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'status' });
    expect(res.status).toBe(200);
    expect(res.body.stages).toBeInstanceOf(Array);
  });

  it('returns 422 when run/approve/reject is missing a stage', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'run' });
    expect(res.status).toBe(422);
  });

  it('returns 422 for a stage name that fails the pattern', async () => {
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'run', stage: '../../etc' });
    expect(res.status).toBe(422);
  });

  it('run dispatches to runnerCli with a channel trigger recording this channel as the source', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'run', stage: '03_report' });
    expect(res.status).toBe(202);
    expect(runnerCli.runStageInBackground).toHaveBeenCalledWith(config.workspaceRoot, '03_report', {
      type: 'channel',
      source: 'ops-bot',
    });
  });

  it('run returns 409 when the workspace is locked, same as the stage-scoped route', async () => {
    writeLock(config.workspaceRoot, { runId: 'x', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const app = buildApp(config, fakeRunnerCli());
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'run', stage: '03_report' });
    expect(res.status).toBe(409);
  });

  it('approve calls runnerCli.approveStage and returns 200 when awaiting_review', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);
    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'approve', stage: '02_analysis' });
    expect(res.status).toBe(200);
    expect(runnerCli.approveStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis');
  });

  it('reject requires a comment and calls runnerCli.rejectStage', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const empty = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'reject', stage: '02_analysis', comment: '' });
    expect(empty.status).toBe(422);

    const res = await request(app)
      .post('/api/channels/ops-bot/actions')
      .set('Authorization', 'Bearer sekret-token')
      .send({ action: 'reject', stage: '02_analysis', comment: 'not ready' });
    expect(res.status).toBe(200);
    expect(runnerCli.rejectStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis', 'not ready');
  });
});
