import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedRealWorkspace, listStageNames, checkStageOrder } from '../src/workspace.js';
import { readState } from '../src/state.js';

describe('seedRealWorkspace', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = join(mkdtempSync(join(tmpdir(), 'real-seed-')), 'workspace');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('layers real stage contracts over the Meridian example, leaving 03_report pending', () => {
    seedRealWorkspace(workspaceRoot);

    // Contracts came from the repo root, not the example.
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'CONTEXT.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'references', 'report-structure.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, '_config', 'conventions.md'))).toBe(true);

    // Engagement data and completed output came from the example.
    const voice = readFileSync(join(workspaceRoot, '_config', 'voice.md'), 'utf-8');
    expect(voice.length).toBeGreaterThan(0);
    expect(existsSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'stages', '02_analysis', 'output', 'insights.md'))).toBe(true);

    // 03_report has no pre-baked output — it's the pending stage.
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'output', 'report.md'))).toBe(false);

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['02_analysis'].status).toBe('approved');
    expect(state.stages['03_report']).toBeUndefined();
  });

  it('writes a workspace CLAUDE.md without the worktree override', () => {
    seedRealWorkspace(workspaceRoot);
    const claudeMd = readFileSync(join(workspaceRoot, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Workspace Identity (Layer 0)');
    expect(claudeMd).not.toContain('Worktree identity');
  });

  it('git-inits and commits the seed', () => {
    seedRealWorkspace(workspaceRoot);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
    expect(status.trim()).toBe('');
  });

  it('is idempotent — reseeding a dirty workspace resets it', () => {
    seedRealWorkspace(workspaceRoot);
    execFileSync('git', ['rm', '-r', '--cached', 'stages/01_research'], { cwd: workspaceRoot });
    seedRealWorkspace(workspaceRoot);
    expect(existsSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'))).toBe(true);
  });
});

describe('listStageNames', () => {
  it('returns [] for a workspace with no stages/ dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-stages-'));
    expect(listStageNames(empty)).toEqual([]);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('checkStageOrder', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = join(mkdtempSync(join(tmpdir(), 'stage-order-')), 'workspace');
    seedRealWorkspace(workspaceRoot);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns null when every earlier stage is approved', () => {
    expect(checkStageOrder(workspaceRoot, '03_report')).toBeNull();
  });

  it('returns null for 02_analysis too, since its only earlier stage (01_research) is approved', () => {
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toBeNull();
  });
});
