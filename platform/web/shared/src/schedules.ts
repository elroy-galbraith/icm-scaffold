import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import cronParserImport from 'cron-parser';
import { listStageNames } from './workspace.js';

// See platform/web/shared/src/state.ts for why this interop shape is needed under
// NodeNext + esModuleInterop: both packages ship CJS with no static `export default`
// that Node's cjs-module-lexer picks up, so a plain default import is the only shape
// that resolves at runtime; named-export syntax throws at import time despite typechecking.
const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;
const { parseExpression } = cronParserImport;

export interface Schedule {
  id: string;
  stage: string;
  cron: string;
  enabled: boolean;
  description?: string;
}

export interface ScheduleConfig {
  schedules: Schedule[];
}

export interface DueSchedule extends Schedule {
  dueAt: string;
}

export class SchedulesValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid schedules config: ${errors.join('; ')}`);
    this.name = 'SchedulesValidationError';
  }
}

const SCHEMAS_DIR = fileURLToPath(new URL('../../../../contracts/schemas', import.meta.url));

function loadSchema(fileName: string): object {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, fileName), 'utf-8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateShape = ajv.compile(loadSchema('schedule-config.schema.json'));

// Unlike state.json/lock/run-log (runner-owned, only ever written by code that already
// went through this validation), schedules.config.json is human-editable — a hand edit
// can put a malformed file on disk at any time. So, unusually for this package, reads
// validate too: a scheduler tick reading garbage should raise clearly, not fail deep
// inside a cron computation with a confusing error.
function validate(workspaceRoot: string, data: unknown): ScheduleConfig {
  if (!validateShape(data)) {
    const errors = (validateShape.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim());
    throw new SchedulesValidationError(errors);
  }
  const config = data as ScheduleConfig;

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const stageNames = new Set(listStageNames(workspaceRoot));
  for (const schedule of config.schedules) {
    if (seenIds.has(schedule.id)) {
      errors.push(`duplicate schedule id: ${schedule.id}`);
    }
    seenIds.add(schedule.id);
    if (!stageNames.has(schedule.stage)) {
      errors.push(`schedule "${schedule.id}" references unknown stage: ${schedule.stage}`);
    }
    try {
      parseExpression(schedule.cron, { utc: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`schedule "${schedule.id}" has an invalid cron expression "${schedule.cron}": ${message}`);
    }
  }
  if (errors.length > 0) {
    throw new SchedulesValidationError(errors);
  }
  return config;
}

function schedulesPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'schedules.config.json');
}

export function readSchedules(workspaceRoot: string): ScheduleConfig {
  const path = schedulesPath(workspaceRoot);
  if (!existsSync(path)) {
    return { schedules: [] };
  }
  return validate(workspaceRoot, JSON.parse(readFileSync(path, 'utf-8')));
}

export function writeSchedules(workspaceRoot: string, config: ScheduleConfig): void {
  const validated = validate(workspaceRoot, config);
  writeFileSync(schedulesPath(workspaceRoot), JSON.stringify(validated, null, 2));
}

/**
 * Enabled schedules whose cron boundary falls in (lastCheckedAt, now]. lastCheckedAt is
 * exclusive so the same boundary is never re-fired on consecutive ticks. readSchedules
 * above already validates every cron expression in the file, so parseExpression here is
 * never called with a string that can throw.
 */
export function dueSchedules(workspaceRoot: string, now: Date, lastCheckedAt: Date): DueSchedule[] {
  const config = readSchedules(workspaceRoot);
  const due: DueSchedule[] = [];
  for (const schedule of config.schedules) {
    if (!schedule.enabled) continue;
    const next = parseExpression(schedule.cron, { currentDate: lastCheckedAt, utc: true }).next().toDate();
    if (next.getTime() <= now.getTime()) {
      due.push({ ...schedule, dueAt: next.toISOString() });
    }
  }
  return due;
}
