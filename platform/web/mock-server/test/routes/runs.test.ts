import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';
import { writeRunLog } from 'icm-web-shared';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

describe('GET /api/runs/:runId', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const scratchDir = join(mkdtempSync(join(tmpdir(), 'route-runs-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, scratchDir, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.scratchDir, { recursive: true, force: true });
  });

  const KNOWN_RUN_ID = '11111111-1111-1111-1111-111111111111';
  const UNKNOWN_RUN_ID = '22222222-2222-2222-2222-222222222222';

  it('returns the full run log for a known runId', async () => {
    writeRunLog(config.scratchDir, {
      runId: KNOWN_RUN_ID,
      stage: '01_research',
      model: 'anthropic/claude-sonnet-5',
      startedAt: '2026-07-12T09:00:00.000Z',
      endedAt: '2026-07-12T09:00:03.000Z',
      status: 'completed',
      filesRead: [],
      filesWritten: ['stages/01_research/output/findings.md'],
      toolCalls: [],
      tokensSpent: 600,
      tokenBudget: 200000,
      gateSummary: 'Done.',
    });
    const app = createApp(config);
    const res = await request(app).get(`/api/runs/${KNOWN_RUN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe(KNOWN_RUN_ID);
    expect(res.body.tokensSpent).toBe(600);
  });

  it('returns 404 for an unknown (but validly-formatted) runId', async () => {
    const app = createApp(config);
    const res = await request(app).get(`/api/runs/${UNKNOWN_RUN_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a runId that is not a UUID, without touching the filesystem', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/runs/does-not-exist');
    expect(res.status).toBe(400);
  });

  it('rejects a path-traversal runId that would otherwise escape .runner/runs/', async () => {
    const app = createApp(config);
    // Encoded slash: without a route-param validator this reaches readRunLog's
    // join() and resolves to <scratchDir>/.runner/state.json instead of a run log.
    const res = await request(app).get('/api/runs/..%2Fstate');
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('stages');
  });
});
