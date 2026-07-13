import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTreeDiffLogRouter } from '../../src/routes/treeDiffLog.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET /api/tree, /api/diff, /api/log', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-tree-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET /api/tree lists workspace entries including .runner', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    const paths = res.body.map((e: { path: string }) => e.path);
    expect(paths).toContain('shared/client-brief.md');
    expect(paths).toContain('.runner/state.json');
  });

  it('GET /api/diff defaults to ref=HEAD~1 and returns an empty diff for a fresh seed', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('HEAD~1');
    expect(res.body.diff).toBe('');
  });

  it('GET /api/diff returns 400 for a ref that looks like a git option', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md', ref: '--output=/tmp/x' });
    expect(res.status).toBe(400);
  });

  it('GET /api/log returns the seed commit', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/log');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].message).toBe('seed');
  });

  it('GET /api/log falls back to the default limit for a non-positive limit instead of passing it through', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/log').query({ limit: '0' });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].message).toBe('seed');
  });
});
