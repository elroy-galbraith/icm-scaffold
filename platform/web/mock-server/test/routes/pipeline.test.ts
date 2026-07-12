import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

describe('GET /api/pipeline', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const scratchDir = join(mkdtempSync(join(tmpdir(), 'route-pipeline-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, scratchDir, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.scratchDir, { recursive: true, force: true });
  });

  it('returns 200 with the seeded pipeline: two approved stages and one pending', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/pipeline');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.stages.map((s: { name: string }) => s.name)).toEqual(['01_research', '02_analysis', '03_report']);
    expect(res.body.stages[0].status).toBe('approved');
    expect(res.body.stages[2].status).toBe('pending');
  });
});
