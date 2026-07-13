import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STAGE_NAME_PATTERN = /^[0-9]{2}_[a-z0-9_]+$/;

export interface WorkspaceRootConfig {
  workspaceRoot: string;
}

export function listStageNames(workspaceRoot: string): string[] {
  const stagesDir = join(workspaceRoot, 'stages');
  if (!existsSync(stagesDir)) return [];
  return readdirSync(stagesDir)
    .filter((name) => STAGE_NAME_PATTERN.test(name) && statSync(join(stagesDir, name)).isDirectory())
    .sort();
}
