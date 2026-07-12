import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { seedWorkspace, type WorkspaceConfig } from '../../src/workspace.js';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/meridian', import.meta.url));

describe('GET /api/tree, /api/diff, /api/log', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    const scratchDir = join(mkdtempSync(join(tmpdir(), 'route-tree-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, scratchDir, pendingStage: '03_report' };
    seedWorkspace(config);
  });

  afterEach(() => {
    rmSync(config.scratchDir, { recursive: true, force: true });
  });

  it('GET /api/tree lists workspace entries including .runner', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    const paths = res.body.map((e: { path: string }) => e.path);
    expect(paths).toContain('shared/client-brief.md');
    expect(paths).toContain('.runner/state.json');
  });

  it('GET /api/diff defaults to ref=HEAD~1 and returns an empty diff for a fresh seed', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('HEAD~1');
    expect(res.body.diff).toBe('');
  });

  it('GET /api/diff shows a non-empty diff after a committed edit', async () => {
    writeFileSync(join(config.scratchDir, 'shared/client-brief.md'), 'A materially different brief.');
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['add', '-A'], { cwd: config.scratchDir });
    execFileSync('git', ['commit', '-m', 'edit brief'], { cwd: config.scratchDir });

    const app = createApp(config);
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md', ref: 'HEAD~1' });
    expect(res.status).toBe(200);
    expect(res.body.diff).toContain('materially different');
  });

  it('GET /api/log returns commits newest first and respects limit', async () => {
    writeFileSync(join(config.scratchDir, 'shared/client-brief.md'), 'v2');
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['add', '-A'], { cwd: config.scratchDir });
    execFileSync('git', ['commit', '-m', 'second commit'], { cwd: config.scratchDir });

    const app = createApp(config);
    const res = await request(app).get('/api/log').query({ limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('second commit');
  });

  it('GET /api/log defaults to limit 50 when not provided', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/log');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].message).toBe('Seed workspace from Meridian fixture');
  });
});
