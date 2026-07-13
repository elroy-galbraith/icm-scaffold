import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { seedWorkspace, listStageNames, type WorkspaceConfig } from '../src/workspace.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/meridian', import.meta.url));

describe('workspace', () => {
  let workspaceRoot: string;
  let config: WorkspaceConfig;

  beforeEach(() => {
    workspaceRoot = join(mkdtempSync(join(tmpdir(), 'ws-scratch-')), 'workspace');
    config = { fixtureDir: FIXTURE_DIR, workspaceRoot, pendingStage: '03_report' };
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('copies fixture content into the scratch directory', () => {
    seedWorkspace(config);
    expect(readFileSync(join(workspaceRoot, 'shared/client-brief.md'), 'utf-8')).toContain('Meridian');
    expect(existsSync(join(workspaceRoot, 'stages/01_research/output/findings.md'))).toBe(true);
  });

  it('empties the pending stage output directory', () => {
    seedWorkspace(config);
    const pendingOutput = join(workspaceRoot, 'stages/03_report/output');
    expect(existsSync(pendingOutput)).toBe(true);
    expect(readdirSync(pendingOutput)).toEqual([]);
  });

  it('leaves other stages\' output intact', () => {
    seedWorkspace(config);
    expect(existsSync(join(workspaceRoot, 'stages/02_analysis/output/insights.md'))).toBe(true);
  });

  it('writes an initial state.json with the pending stage pending and others approved', () => {
    seedWorkspace(config);
    const state = JSON.parse(readFileSync(join(workspaceRoot, '.runner/state.json'), 'utf-8'));
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['02_analysis'].status).toBe('approved');
    expect(state.stages['03_report'].status).toBe('pending');
  });

  it('git-initializes the scratch directory with a seed commit', () => {
    seedWorkspace(config);
    const log = execFileSync('git', ['log', '--oneline'], { cwd: workspaceRoot }).toString().trim();
    expect(log.split('\n')).toHaveLength(1);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
    expect(status.trim()).toBe('');
  });

  it('is idempotent: re-seeding wipes prior mutations', () => {
    seedWorkspace(config);
    writeFileSync(join(workspaceRoot, 'stages/03_report/output/mutated.md'), 'mutated');
    seedWorkspace(config);
    const pendingOutput = join(workspaceRoot, 'stages/03_report/output');
    expect(readdirSync(pendingOutput)).toEqual([]);
  });

  it('listStageNames returns stage directories in numeric-prefix order', () => {
    seedWorkspace(config);
    expect(listStageNames(workspaceRoot)).toEqual(['01_research', '02_analysis', '03_report']);
  });
});
