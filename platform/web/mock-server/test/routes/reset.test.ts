import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

describe('POST /api/_reset', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const workspaceRoot = join(mkdtempSync(join(tmpdir(), 'route-reset-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, workspaceRoot, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('restores the seed state after the workspace has been mutated', async () => {
    writeFileSync(join(config.workspaceRoot, 'stages/03_report/output/leftover.md'), 'stray file');

    const app = createApp(config);
    const res = await request(app).post('/api/_reset');
    expect(res.status).toBe(200);

    expect(readdirSync(join(config.workspaceRoot, 'stages/03_report/output'))).toEqual([]);

    const pipeline = await request(app).get('/api/pipeline');
    expect(pipeline.body.stages.find((s: { name: string }) => s.name === '03_report').status).toBe('pending');
    expect(pipeline.body.stages.find((s: { name: string }) => s.name === '01_research').status).toBe('approved');
  });
});
