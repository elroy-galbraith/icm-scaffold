import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createSchedulesRouter } from 'icm-web-shared';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import { writeLock } from 'icm-web-shared';
import type { WorkspaceConfig } from '../../src/workspace.js';

function buildApp(config: WorkspaceConfig) {
  const app = express();
  app.use(express.json());
  app.use(createSchedulesRouter(config));
  return app;
}

describe('schedules routes (via the live server)', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-schedules-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET returns an empty list before any schedules are configured', async () => {
    const app = buildApp(config);
    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ schedules: [] });
  });

  it('PUT replaces the schedule list and commits it to the workspace', async () => {
    const app = buildApp(config);
    const body = { schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }] };

    const res = await request(app).put('/api/schedules').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);

    const getRes = await request(app).get('/api/schedules');
    expect(getRes.body).toEqual(body);
  });

  it('PUT returns 422 for a schedule referencing an unknown stage', async () => {
    const app = buildApp(config);
    const res = await request(app)
      .put('/api/schedules')
      .send({ schedules: [{ id: 'x', stage: '99_nope', cron: '0 9 * * *', enabled: true }] });
    expect(res.status).toBe(422);
  });

  it('PUT returns 409 when the workspace is locked', async () => {
    writeLock(config.workspaceRoot, { runId: 'x', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const app = buildApp(config);
    const res = await request(app)
      .put('/api/schedules')
      .send({ schedules: [{ id: 'nightly', stage: '03_report', cron: '0 9 * * *', enabled: true }] });
    expect(res.status).toBe(409);
  });
});
