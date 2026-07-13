import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listStageNames, readState, type StageStatus } from 'icm-web-shared';

export { STAGE_NAME_PATTERN, listStageNames } from 'icm-web-shared';

export interface WorkspaceConfig {
  workspaceRoot: string;
}

export interface StageBlock {
  blockingStage: string;
  blockingStatus: StageStatus;
}

// platform/web/server/src/workspace.ts -> repo root is four levels up.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples', 'meridian-support-automation');
const WORKSPACE_CLAUDE_MD = readFileSync(
  fileURLToPath(new URL('./assets/workspace-claude.md', import.meta.url)),
  'utf-8'
);

const APPROVED_ON_SEED = ['01_research', '02_analysis'];

export function checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null {
  const state = readState(workspaceRoot);
  for (const candidate of listStageNames(workspaceRoot)) {
    if (candidate >= stage) break;
    const status = state.stages[candidate]?.status ?? 'pending';
    if (status !== 'approved') {
      return { blockingStage: candidate, blockingStatus: status };
    }
  }
  return null;
}

export function seedRealWorkspace(workspaceRoot: string): void {
  if (existsSync(workspaceRoot)) {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
  mkdirSync(workspaceRoot, { recursive: true });

  cpSync(join(REPO_ROOT, 'stages'), join(workspaceRoot, 'stages'), { recursive: true });
  cpSync(join(REPO_ROOT, 'CONTEXT.md'), join(workspaceRoot, 'CONTEXT.md'));

  mkdirSync(join(workspaceRoot, '_config'), { recursive: true });
  cpSync(join(REPO_ROOT, '_config', 'conventions.md'), join(workspaceRoot, '_config', 'conventions.md'));
  cpSync(join(EXAMPLE_DIR, '_config', 'voice.md'), join(workspaceRoot, '_config', 'voice.md'));
  cpSync(join(EXAMPLE_DIR, 'shared'), join(workspaceRoot, 'shared'), { recursive: true });
  for (const stage of APPROVED_ON_SEED) {
    cpSync(
      join(EXAMPLE_DIR, 'stages', stage, 'output'),
      join(workspaceRoot, 'stages', stage, 'output'),
      { recursive: true }
    );
  }

  writeFileSync(join(workspaceRoot, 'CLAUDE.md'), WORKSPACE_CLAUDE_MD);

  const now = new Date().toISOString();
  const stages: Record<string, { status: StageStatus; updatedAt: string }> = {};
  for (const name of APPROVED_ON_SEED) {
    stages[name] = { status: 'approved', updatedAt: now };
  }
  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(join(workspaceRoot, '.runner', 'state.json'), JSON.stringify({ stages }, null, 2));

  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'icm-web-server@icm.local'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'ICM Web Server'], { cwd: workspaceRoot });
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'Seed live test workspace from repo contracts + Meridian example'], {
    cwd: workspaceRoot,
  });
}
