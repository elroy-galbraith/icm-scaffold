import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSchedules, writeSchedules, dueSchedules, SchedulesValidationError, type ScheduleConfig } from '../src/schedules.js';

function seedStages(workspaceRoot: string, stages: string[]): void {
  for (const stage of stages) {
    mkdirSync(join(workspaceRoot, 'stages', stage), { recursive: true });
  }
}

describe('schedules', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'schedules-'));
    seedStages(workspaceRoot, ['01_research', '02_analysis']);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns an empty list when no schedules.config.json exists', () => {
    expect(readSchedules(workspaceRoot)).toEqual({ schedules: [] });
  });

  it('writes and reads back a valid schedule', () => {
    const config: ScheduleConfig = {
      schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
    };
    writeSchedules(workspaceRoot, config);
    expect(readSchedules(workspaceRoot)).toEqual(config);
  });

  it('rejects a schedule referencing an unknown stage', () => {
    const config: ScheduleConfig = { schedules: [{ id: 'x', stage: '99_nope', cron: '0 9 * * *', enabled: true }] };
    expect(() => writeSchedules(workspaceRoot, config)).toThrow(SchedulesValidationError);
  });

  it('rejects an invalid cron expression', () => {
    const config: ScheduleConfig = {
      schedules: [{ id: 'x', stage: '01_research', cron: 'not a cron', enabled: true }],
    };
    expect(() => writeSchedules(workspaceRoot, config)).toThrow(SchedulesValidationError);
  });

  it('rejects duplicate schedule ids', () => {
    const config: ScheduleConfig = {
      schedules: [
        { id: 'dup', stage: '01_research', cron: '0 9 * * *', enabled: true },
        { id: 'dup', stage: '02_analysis', cron: '0 10 * * *', enabled: true },
      ],
    };
    expect(() => writeSchedules(workspaceRoot, config)).toThrow(SchedulesValidationError);
  });

  it('rejects a shape that fails the JSON schema (missing required field)', () => {
    expect(() =>
      writeSchedules(workspaceRoot, { schedules: [{ id: 'x' }] } as unknown as ScheduleConfig)
    ).toThrow(SchedulesValidationError);
  });

  it('a hand-edited file that fails validation raises on read too, not just write', () => {
    writeSchedules(workspaceRoot, {
      schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
    });
    // Simulate a human hand-editing the file into a state writeSchedules would reject.
    writeFileSync(join(workspaceRoot, 'schedules.config.json'), JSON.stringify({ schedules: [{ id: 'x' }] }));
    expect(() => readSchedules(workspaceRoot)).toThrow(SchedulesValidationError);
  });

  describe('dueSchedules', () => {
    it('is due when a cron boundary falls in (lastCheckedAt, now]', () => {
      writeSchedules(workspaceRoot, {
        schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
      });
      const due = dueSchedules(workspaceRoot, new Date('2026-07-20T09:03:00.000Z'), new Date('2026-07-20T08:58:00.000Z'));
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe('nightly');
      expect(due[0].dueAt).toBe('2026-07-20T09:00:00.000Z');
    });

    it('is not due when no boundary was crossed', () => {
      writeSchedules(workspaceRoot, {
        schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
      });
      const due = dueSchedules(workspaceRoot, new Date('2026-07-20T09:03:00.000Z'), new Date('2026-07-20T09:01:00.000Z'));
      expect(due).toEqual([]);
    });

    it('never fires a disabled schedule', () => {
      writeSchedules(workspaceRoot, {
        schedules: [{ id: 'off', stage: '01_research', cron: '0 9 * * *', enabled: false }],
      });
      const due = dueSchedules(workspaceRoot, new Date('2026-07-20T09:03:00.000Z'), new Date('2026-07-20T08:58:00.000Z'));
      expect(due).toEqual([]);
    });

    it('does not re-fire the same boundary on the next tick (lastCheckedAt is exclusive)', () => {
      writeSchedules(workspaceRoot, {
        schedules: [{ id: 'nightly', stage: '01_research', cron: '0 9 * * *', enabled: true }],
      });
      const firstTick = dueSchedules(workspaceRoot, new Date('2026-07-20T09:03:00.000Z'), new Date('2026-07-20T08:58:00.000Z'));
      expect(firstTick).toHaveLength(1);

      const secondTick = dueSchedules(workspaceRoot, new Date('2026-07-20T09:08:00.000Z'), new Date('2026-07-20T09:03:00.000Z'));
      expect(secondTick).toEqual([]);
    });
  });
});
