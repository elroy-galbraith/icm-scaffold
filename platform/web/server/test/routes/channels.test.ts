import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createChannelsRouter, writeLock } from 'icm-web-shared';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

function buildApp(config: WorkspaceConfig) {
  const app = express();
  app.use(express.json());
  app.use(createChannelsRouter(config));
  return app;
}

describe('channels routes (via the live server)', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-channels-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET returns an empty list before any channels are configured', async () => {
    const app = buildApp(config);
    const res = await request(app).get('/api/channels');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ channels: [] });
  });

  it('PUT replaces the channel list, storing only the token env var name — never a secret', async () => {
    const app = buildApp(config);
    const body = {
      channels: [
        { id: 'ops-bot', kind: 'http', tokenEnvVar: 'ICM_CHANNEL_OPS_BOT_TOKEN', allowedActions: ['status'], enabled: true },
      ],
    };

    const res = await request(app).put('/api/channels').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);

    const getRes = await request(app).get('/api/channels');
    expect(getRes.body).toEqual(body);
  });

  it('PUT returns 422 for duplicate channel ids', async () => {
    const app = buildApp(config);
    const res = await request(app)
      .put('/api/channels')
      .send({
        channels: [
          { id: 'dup', kind: 'http', tokenEnvVar: 'A', allowedActions: ['status'], enabled: true },
          { id: 'dup', kind: 'http', tokenEnvVar: 'B', allowedActions: ['status'], enabled: true },
        ],
      });
    expect(res.status).toBe(422);
  });

  it('PUT returns 409 when the workspace is locked', async () => {
    writeLock(config.workspaceRoot, { runId: 'x', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const app = buildApp(config);
    const res = await request(app)
      .put('/api/channels')
      .send({ channels: [{ id: 'ops-bot', kind: 'http', tokenEnvVar: 'A', allowedActions: ['status'], enabled: true }] });
    expect(res.status).toBe(409);
  });
});
