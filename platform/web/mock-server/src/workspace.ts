import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listStageNames } from 'icm-web-shared';

export { STAGE_NAME_PATTERN, listStageNames } from 'icm-web-shared';

export interface WorkspaceConfig {
  fixtureDir: string;
  scratchDir: string;
  pendingStage: string;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  fixtureDir: fileURLToPath(new URL('../../../../examples/meridian-support-automation', import.meta.url)),
  scratchDir: join(tmpdir(), 'icm-web-mock-workspace'),
  pendingStage: '03_report',
};

export function seedWorkspace(config: WorkspaceConfig): void {
  const { fixtureDir, scratchDir, pendingStage } = config;

  if (existsSync(scratchDir)) {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  mkdirSync(scratchDir, { recursive: true });
  cpSync(fixtureDir, scratchDir, { recursive: true });

  const pendingOutputDir = join(scratchDir, 'stages', pendingStage, 'output');
  if (existsSync(pendingOutputDir)) {
    rmSync(pendingOutputDir, { recursive: true, force: true });
  }
  mkdirSync(pendingOutputDir, { recursive: true });

  const stageNames = listStageNames(scratchDir);
  const now = new Date().toISOString();
  const stages: Record<string, { status: string; updatedAt: string }> = {};
  for (const name of stageNames) {
    stages[name] = { status: name === pendingStage ? 'pending' : 'approved', updatedAt: now };
  }

  mkdirSync(join(scratchDir, '.runner'), { recursive: true });
  writeFileSync(join(scratchDir, '.runner', 'state.json'), JSON.stringify({ stages }, null, 2));

  execFileSync('git', ['init'], { cwd: scratchDir });
  execFileSync('git', ['config', 'user.email', 'mock-server@icm.local'], { cwd: scratchDir });
  execFileSync('git', ['config', 'user.name', 'ICM Mock Server'], { cwd: scratchDir });
  execFileSync('git', ['add', '-A'], { cwd: scratchDir });
  execFileSync('git', ['commit', '-m', 'Seed workspace from Meridian fixture'], { cwd: scratchDir });
}
