import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';
import { writeState, writeLock } from '../../src/state.js';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

function poll<T>(fn: () => T | Promise<T>, predicate: (value: T) => boolean, timeoutMs = 2000, intervalMs = 20): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      Promise.resolve(fn()).then((value) => {
        if (predicate(value)) {
          resolve(value);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error('poll timed out'));
          return;
        }
        setTimeout(tick, intervalMs);
      }, reject);
    };
    tick();
  });
}

describe('stage action routes', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const scratchDir = join(mkdtempSync(join(tmpdir(), 'route-stage-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, scratchDir, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.scratchDir, { recursive: true, force: true });
  });

  it('POST run returns 202 immediately, then the stage transitions to awaiting_review', async () => {
    const app = createApp(config, { runDelayMs: 5 });

    const runRes = await request(app).post('/api/stages/03_report/run');
    expect(runRes.status).toBe(202);

    const pipeline = await poll(
      async () => (await request(app).get('/api/pipeline')).body,
      (body) => body.stages.find((s: { name: string }) => s.name === '03_report')?.status === 'awaiting_review'
    );
    const stage = pipeline.stages.find((s: { name: string }) => s.name === '03_report');
    expect(stage.status).toBe('awaiting_review');
    expect(stage.running).toBe(false);
  });

  it('POST run returns 409 with the lock holder when the workspace is already locked', async () => {
    writeLock(config.scratchDir, { runId: 'other', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const app = createApp(config, { runDelayMs: 5 });
    const res = await request(app).post('/api/stages/03_report/run');
    expect(res.status).toBe(409);
    expect(res.body.runId).toBe('other');
    expect(res.body.stage).toBe('01_research');
  });

  it('POST run returns 422 naming the blocking stage when ordering is violated', async () => {
    writeState(config.scratchDir, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const app = createApp(config, { runDelayMs: 5 });
    const res = await request(app).post('/api/stages/03_report/run');
    expect(res.status).toBe(422);
    expect(res.body.blockingStage).toBe('02_analysis');
    expect(res.body.blockingStatus).toBe('pending');
  });

  it('POST approve moves an awaiting_review stage to approved', async () => {
    writeState(config.scratchDir, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const app = createApp(config, { runDelayMs: 5 });
    const res = await request(app).post('/api/stages/02_analysis/approve');
    expect(res.status).toBe(200);
    const pipeline = await request(app).get('/api/pipeline');
    expect(pipeline.body.stages.find((s: { name: string }) => s.name === '02_analysis').status).toBe('approved');
  });

  it('POST approve returns 409 when the stage is not awaiting_review', async () => {
    const app = createApp(config, { runDelayMs: 5 });
    const res = await request(app).post('/api/stages/01_research/approve');
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('approved');
  });

  it('POST reject stores the comment and returns 409 on a second attempt', async () => {
    writeState(config.scratchDir, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const app = createApp(config, { runDelayMs: 5 });

    const res = await request(app).post('/api/stages/02_analysis/reject').send({ comment: 'too shallow' });
    expect(res.status).toBe(200);

    const pipeline = await request(app).get('/api/pipeline');
    const stage = pipeline.body.stages.find((s: { name: string }) => s.name === '02_analysis');
    expect(stage.status).toBe('rejected');
    expect(stage.comment).toBe('too shallow');

    const second = await request(app).post('/api/stages/02_analysis/reject').send({ comment: 'again' });
    expect(second.status).toBe(409);
  });
});
