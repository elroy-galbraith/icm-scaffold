import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { createFilesRouter } from 'icm-web-shared';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET/PUT /api/files', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-files-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET returns the file content', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('shared/client-brief.md');
    expect(res.body.content).toContain('Meridian');
  });

  it('GET returns 404 for a missing file', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: 'shared/does-not-exist.md' });
    expect(res.status).toBe(404);
  });

  it('GET returns 403 for a path that escapes the workspace', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: '../outside.md' });
    expect(res.status).toBe(403);
  });

  it('PUT writes the file and commits a "human edit"', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();

    const res = await request(app)
      .put('/api/files')
      .query({ path: 'shared/client-brief.md' })
      .send({ content: '# Client Brief\n\nUpdated by a human.\n' });

    expect(res.status).toBe(200);
    const content = readFileSync(join(config.workspaceRoot, 'shared', 'client-brief.md'), 'utf-8');
    expect(content).toContain('Updated by a human.');
    const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();
    expect(after).not.toBe(before);
    const log = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: config.workspaceRoot }).toString();
    expect(log).toContain('human edit');
  });

  it('PUT returns 403 for a path targeting .runner/', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).put('/api/files').query({ path: '.runner/state.json' }).send({ content: '{}' });
    expect(res.status).toBe(403);
  });
});
