import type { TreeEntry } from '../api/client.js';

export interface StageFileGroup {
  stage: string;
  primary: TreeEntry[];
  secondary: TreeEntry[];
}

export interface GroupedTree {
  workspace: TreeEntry[];
  stages: StageFileGroup[];
}

const STAGE_PATH = /^stages\/([^/]+)\/(.*)$/;

export function groupTree(entries: TreeEntry[], stageNames: string[]): GroupedTree {
  const stageNameSet = new Set(stageNames);
  const stageGroups = new Map<string, StageFileGroup>();
  for (const name of stageNames) {
    stageGroups.set(name, { stage: name, primary: [], secondary: [] });
  }

  const workspace: TreeEntry[] = [];

  for (const entry of entries) {
    if (entry.type !== 'file') continue;
    if (isNoise(entry.path)) continue;

    const match = STAGE_PATH.exec(entry.path);
    const stageName = match?.[1];
    if (!match || !stageName || !stageNameSet.has(stageName)) {
      workspace.push(entry);
      continue;
    }

    const group = stageGroups.get(stageName)!;
    if (match[2].startsWith('output/')) {
      group.primary.push(entry);
    } else {
      group.secondary.push(entry);
    }
  }

  return {
    workspace,
    stages: stageNames.map((name) => stageGroups.get(name)!),
  };
}

function isNoise(path: string): boolean {
  return path === '.gitkeep' || path.endsWith('/.gitkeep') || path === '.runner' || path.startsWith('.runner/');
}
