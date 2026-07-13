import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createPipelineRouter } from 'icm-web-shared';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET /api/pipeline', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-pipeline-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('returns 200 with the seeded pipeline: two approved stages and one pending', async () => {
    const app = express();
    app.use(createPipelineRouter(config));
    const res = await request(app).get('/api/pipeline');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.stages.map((s: { name: string }) => s.name)).toEqual([
      '01_research',
      '02_analysis',
      '03_report',
    ]);
    expect(res.body.stages[0].status).toBe('approved');
    expect(res.body.stages[2].status).toBe('pending');
  });
});
