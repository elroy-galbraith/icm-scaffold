import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, updateStageState } from '../src/state.js';

describe('state', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'state-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('starts with no stages', () => {
    expect(readState(workspaceRoot)).toEqual({ stages: {} });
  });

  it('creates a stage entry on first update', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('awaiting_review');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('preserves fields not included in the patch', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('records a rejection comment', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'rejected', comment: 'too shallow' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].comment).toBe('too shallow');
  });

  it('clears the comment when the patch explicitly sets it to undefined', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'rejected', comment: 'x' });
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', comment: undefined });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].comment).toBeUndefined();
  });
});
