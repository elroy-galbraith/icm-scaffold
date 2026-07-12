import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverStages, checkStageOrder } from '../src/stageOrder.js';
import { updateStageState } from '../src/state.js';

describe('stageOrder', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'stage-order-'));
    mkdirSync(join(workspaceRoot, 'stages', '01_research'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '02_analysis'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '03_report'), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('discovers stage directories in numeric order', () => {
    expect(discoverStages(workspaceRoot)).toEqual(['01_research', '02_analysis', '03_report']);
  });

  it('does not block the first stage', () => {
    expect(checkStageOrder(workspaceRoot, '01_research')).toBeNull();
  });

  it('blocks a later stage when an earlier one is pending', () => {
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toEqual({
      blockingStage: '01_research',
      blockingStatus: 'pending',
    });
  });

  it('does not block once the earlier stage is approved', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toBeNull();
  });

  it('blocks on the first unapproved stage, even if a later one is further along', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    updateStageState(workspaceRoot, '02_analysis', { status: 'awaiting_review' });
    expect(checkStageOrder(workspaceRoot, '03_report')).toEqual({
      blockingStage: '02_analysis',
      blockingStatus: 'awaiting_review',
    });
  });
});
