import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { STAGE_NAME_PATTERN, listStageNames } from 'icm-web-shared';

export { STAGE_NAME_PATTERN, listStageNames };

export interface WorkspaceConfig {
  fixtureDir: string;
  workspaceRoot: string;
  pendingStage: string;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  fixtureDir: fileURLToPath(new URL('../../../../examples/meridian-support-automation', import.meta.url)),
  workspaceRoot: join(tmpdir(), 'icm-web-mock-workspace'),
  pendingStage: '03_report',
};

export function seedWorkspace(config: WorkspaceConfig): void {
  const { fixtureDir, workspaceRoot, pendingStage } = config;

  if (existsSync(workspaceRoot)) {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
  mkdirSync(workspaceRoot, { recursive: true });
  cpSync(fixtureDir, workspaceRoot, { recursive: true });

  const pendingOutputDir = join(workspaceRoot, 'stages', pendingStage, 'output');
  if (existsSync(pendingOutputDir)) {
    rmSync(pendingOutputDir, { recursive: true, force: true });
  }
  mkdirSync(pendingOutputDir, { recursive: true });

  const stageNames = listStageNames(workspaceRoot);
  const now = new Date().toISOString();
  const stages: Record<string, { status: string; updatedAt: string }> = {};
  for (const name of stageNames) {
    stages[name] = { status: name === pendingStage ? 'pending' : 'approved', updatedAt: now };
  }

  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(join(workspaceRoot, '.runner', 'state.json'), JSON.stringify({ stages }, null, 2));

  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'mock-server@icm.local'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'ICM Mock Server'], { cwd: workspaceRoot });
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'Seed workspace from Meridian fixture'], { cwd: workspaceRoot });
}
