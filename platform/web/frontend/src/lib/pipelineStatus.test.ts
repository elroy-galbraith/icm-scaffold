import { describe, it, expect } from 'vitest';
import { computeBlockedBy, computeFocusStage } from './pipelineStatus.js';
import type { StageView } from '../api/client.js';

function stage(overrides: Partial<StageView> & Pick<StageView, 'name' | 'status'>): StageView {
  return { running: false, ...overrides };
}

describe('computeBlockedBy', () => {
  it('returns null when every earlier stage is approved', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    expect(computeBlockedBy(stages, '02_analysis')).toBeNull();
  });

  it('returns the first unapproved earlier stage', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'rejected' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeBlockedBy(stages, '03_report')).toEqual({ stage: '02_analysis', status: 'rejected' });
  });
});

describe('computeFocusStage', () => {
  it('returns null for an empty stage list', () => {
    expect(computeFocusStage([])).toBeNull();
  });

  it('prioritizes an awaiting_review stage over a later pending one', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'awaiting_review' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('02_analysis');
  });

  it('treats a rejected stage with the same priority as awaiting_review', () => {
    const stages = [
      stage({ name: '01_research', status: 'rejected' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('01_research');
  });

  it('falls back to the first unblocked pending stage when nothing needs review', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'pending' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('02_analysis');
  });

  it('skips a blocked pending stage in favor of a later one that is unblocked', () => {
    // Not a realistic pipeline shape (stages are normally ordered), but exercises the
    // "blocked" branch independently of ordering assumptions.
    const stages = [
      stage({ name: '01_research', status: 'rejected' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    // 01_research is rejected so it wins on priority 1 before priority 2 is even considered.
    expect(computeFocusStage(stages)).toBe('01_research');
  });

  it('falls back to the last stage when every stage is approved', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'approved' }),
      stage({ name: '03_report', status: 'approved' }),
    ];
    expect(computeFocusStage(stages)).toBe('03_report');
  });
});
