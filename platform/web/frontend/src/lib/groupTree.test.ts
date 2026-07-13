import { describe, it, expect } from 'vitest';
import { groupTree } from './groupTree.js';
import type { TreeEntry } from '../api/client.js';

const STAGE_NAMES = ['01_research', '02_analysis', '03_report'];

describe('groupTree', () => {
  it("buckets stage output files into that stage's primary list", () => {
    const entries: TreeEntry[] = [
      { path: 'stages/01_research/output/findings.md', type: 'file' },
      { path: 'stages/01_research/output/sources.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const research = result.stages.find((g) => g.stage === '01_research')!;
    expect(research.primary.map((e) => e.path)).toEqual([
      'stages/01_research/output/findings.md',
      'stages/01_research/output/sources.md',
    ]);
    expect(research.secondary).toEqual([]);
  });

  it("buckets non-output stage files into that stage's secondary list", () => {
    const entries: TreeEntry[] = [
      { path: 'stages/02_analysis/CONTEXT.md', type: 'file' },
      { path: 'stages/02_analysis/references/analysis-framework.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const analysis = result.stages.find((g) => g.stage === '02_analysis')!;
    expect(analysis.secondary.map((e) => e.path)).toEqual([
      'stages/02_analysis/CONTEXT.md',
      'stages/02_analysis/references/analysis-framework.md',
    ]);
    expect(analysis.primary).toEqual([]);
  });

  it('buckets root-level and non-stage files into the workspace group', () => {
    const entries: TreeEntry[] = [
      { path: 'CONTEXT.md', type: 'file' },
      { path: '_config/voice.md', type: 'file' },
      { path: 'shared/client-brief.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace.map((e) => e.path)).toEqual([
      'CONTEXT.md',
      '_config/voice.md',
      'shared/client-brief.md',
    ]);
  });

  it('drops .gitkeep files and everything under .runner', () => {
    const entries: TreeEntry[] = [
      { path: 'stages/01_research/output/.gitkeep', type: 'file' },
      { path: '.gitkeep', type: 'file' },
      { path: '.runner/state.json', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace).toEqual([]);
    expect(result.stages.every((g) => g.primary.length === 0 && g.secondary.length === 0)).toBe(true);
  });

  it('drops directory entries, keeping only files', () => {
    const entries: TreeEntry[] = [
      { path: 'stages', type: 'dir' },
      { path: 'stages/01_research', type: 'dir' },
      { path: 'stages/01_research/output', type: 'dir' },
      { path: 'stages/01_research/output/findings.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const research = result.stages.find((g) => g.stage === '01_research')!;
    expect(research.primary.map((e) => e.path)).toEqual(['stages/01_research/output/findings.md']);
  });

  it('returns a group for every stage name even when it has no files', () => {
    const result = groupTree([], STAGE_NAMES);
    expect(result.stages.map((g) => g.stage)).toEqual(STAGE_NAMES);
    expect(result.workspace).toEqual([]);
  });

  it('treats a path under an unrecognized "stages/" directory as a workspace file', () => {
    const entries: TreeEntry[] = [{ path: 'stages/99_unknown/output/x.md', type: 'file' }];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace.map((e) => e.path)).toEqual(['stages/99_unknown/output/x.md']);
  });
});
