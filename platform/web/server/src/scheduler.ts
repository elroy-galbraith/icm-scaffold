import { dueSchedules } from 'icm-web-shared';
import type { WorkspaceConfig } from './workspace.js';
import type { RunnerCli } from './runnerCli.js';
import { performRunStage } from './actions.js';

export interface SchedulerOptions {
  intervalMs?: number;
  now?: () => Date;
}

export interface SchedulerHandle {
  stop(): void;
  /** Runs one check immediately, bypassing the interval — how tests drive this without real timers. */
  tick(): void;
}

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Polls schedules.config.json on an interval and triggers due stages via the same
 * performRunStage path a human's "Run stage N" click uses — see contracts/README.md
 * "Schedules & channels": a schedule only ever calls run, and a locked/blocked/already-
 * awaiting-review stage is skipped for this tick, not queued or retried aggressively.
 */
export function startScheduler(
  config: WorkspaceConfig,
  runnerCli: RunnerCli,
  options: SchedulerOptions = {}
): SchedulerHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = options.now ?? (() => new Date());
  let lastCheckedAt = now();

  function tick(): void {
    const currentTick = now();

    let due;
    try {
      due = dueSchedules(config.workspaceRoot, currentTick, lastCheckedAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] could not read schedules.config.json, will retry next tick: ${message}`);
      return; // lastCheckedAt is deliberately not advanced — the next tick retries this same window.
    }

    for (const schedule of due) {
      try {
        const result = performRunStage(config, runnerCli, schedule.stage, { type: 'schedule', source: schedule.id });
        if (result.status === 202) {
          console.log(`[scheduler] ${schedule.id} triggered stage ${schedule.stage}`);
        } else {
          console.log(`[scheduler] ${schedule.id} (${schedule.stage}) skipped: ${JSON.stringify(result.body)}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler] ${schedule.id} (${schedule.stage}) failed: ${message}`);
      }
    }

    lastCheckedAt = currentTick;
  }

  const timer = setInterval(tick, intervalMs);
  // Node keeps the process alive while a timer is pending; unref lets a process that
  // imports this module (e.g. a test) exit without every caller having to call stop().
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
    tick,
  };
}
