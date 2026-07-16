import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RunStatus = 'completed' | 'aborted_budget' | 'error';

export interface ToolCallLogEntry {
  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage' | 'fetch_url' | 'run_script';
  args: Record<string, unknown>;
  result: 'ok' | 'error';
  errorMessage?: string;
  timestamp: string;
}

export type TriggerType = 'manual' | 'schedule' | 'channel';

export interface RunTrigger {
  type: TriggerType;
  source?: string;
}

export interface RunLog {
  runId: string;
  stage: string;
  model: string;
  startedAt: string;
  endedAt: string;
  status: RunStatus;
  filesRead: string[];
  filesWritten: string[];
  toolCalls: ToolCallLogEntry[];
  tokensSpent: number;
  tokenBudget: number;
  gateSummary?: string;
  errorMessage?: string;
  trigger?: RunTrigger;
}

function runsDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner', 'runs');
}

export function writeRunLog(workspaceRoot: string, log: RunLog): string {
  const dir = runsDir(workspaceRoot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${log.runId}.json`);
  writeFileSync(path, JSON.stringify(log, null, 2));
  return path;
}

export function readLatestRunLog(workspaceRoot: string, stage?: string): RunLog | null {
  const dir = runsDir(workspaceRoot);
  if (!existsSync(dir)) return null;
  const logs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as RunLog)
    .filter((l) => !stage || l.stage === stage)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  return logs.length > 0 ? logs[logs.length - 1] : null;
}
