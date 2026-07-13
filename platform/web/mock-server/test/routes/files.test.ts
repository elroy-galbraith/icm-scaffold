import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';
import { writeLock } from 'icm-web-shared';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

describe('GET/PUT /api/files', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const workspaceRoot = join(mkdtempSync(join(tmpdir(), 'route-files-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, workspaceRoot, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET returns the file content', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/files').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('shared/client-brief.md');
    expect(res.body.content).toContain('Meridian');
  });

  it('GET returns 404 for a missing file', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/files').query({ path: 'shared/does-not-exist.md' });
    expect(res.status).toBe(404);
  });

  it('GET returns 403 for a path that escapes the workspace', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/files').query({ path: '../outside.md' });
    expect(res.status).toBe(403);
  });

  it('PUT writes the file and commits a "human edit"', async () => {
    const app = createApp(config);
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();

    const res = await request(app)
      .put('/api/files')
      .query({ path: 'shared/client-brief.md' })
      .send({ content: 'Edited brief.' });

    expect(res.status).toBe(200);
    expect(readFileSync(join(config.workspaceRoot, 'shared/client-brief.md'), 'utf-8')).toBe('Edited brief.');

    const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();
    expect(after).not.toBe(before);
    const lastMessage = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: config.workspaceRoot }).toString().trim();
    expect(lastMessage).toContain('human edit');
  });

  it('PUT returns 403 for a path targeting .runner/', async () => {
    const app = createApp(config);
    const res = await request(app).put('/api/files').query({ path: '.runner/state.json' }).send({ content: '{}' });
    expect(res.status).toBe(403);
  });

  it('PUT returns 403 for a .runner/ path spelled with a leading "./"', async () => {
    const app = createApp(config);
    const res = await request(app)
      .put('/api/files')
      .query({ path: './.runner/evil.json' })
      .send({ content: '{}' });
    expect(res.status).toBe(403);
    expect(existsSync(join(config.workspaceRoot, '.runner/evil.json'))).toBe(false);
  });

  it('PUT returns 403 for a .runner/ path spelled via a "../" normalization trick', async () => {
    const app = createApp(config);
    const res = await request(app)
      .put('/api/files')
      .query({ path: 'shared/../.runner/evil.json' })
      .send({ content: '{}' });
    expect(res.status).toBe(403);
    expect(existsSync(join(config.workspaceRoot, '.runner/evil.json'))).toBe(false);
  });

  it('GET/PUT return 403 for a path that escapes the workspace through a symlink', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'route-files-outside-'));
    try {
      const app = createApp(config);
      symlinkSync(outsideDir, join(config.workspaceRoot, 'escape'));

      const getRes = await request(app).get('/api/files').query({ path: 'escape/secret.txt' });
      expect(getRes.status).toBe(403);

      const putRes = await request(app)
        .put('/api/files')
        .query({ path: 'escape/evil.json' })
        .send({ content: '{}' });
      expect(putRes.status).toBe(403);
      expect(existsSync(join(outsideDir, 'evil.json'))).toBe(false);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('PUT returns 409 when the workspace is locked', async () => {
    writeLock(config.workspaceRoot, { runId: 'run-1', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const app = createApp(config);
    const res = await request(app)
      .put('/api/files')
      .query({ path: 'shared/client-brief.md' })
      .send({ content: 'Edited during a run.' });
    expect(res.status).toBe(409);
    expect(res.body.runId).toBe('run-1');
  });
});
