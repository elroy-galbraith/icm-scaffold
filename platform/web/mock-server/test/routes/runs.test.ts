import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';
import { writeRunLog } from '../../src/state.js';

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

  it('returns the full run log for a known runId', async () => {
    writeRunLog(config.scratchDir, {
      runId: 'run-1',
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
    const res = await request(app).get('/api/runs/run-1');
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe('run-1');
    expect(res.body.tokensSpent).toBe(600);
  });

  it('returns 404 for an unknown runId', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/runs/does-not-exist');
    expect(res.status).toBe(404);
  });
});
