export type StageStatus = 'pending' | 'awaiting_review' | 'approved' | 'rejected';
export type RunStatus = 'completed' | 'aborted_budget' | 'error';

export interface LastRunSummary {
  runId: string;
  status: RunStatus;
  endedAt: string;
  tokensSpent: number;
  tokenBudget: number;
  gateSummary?: string | null;
  errorMessage?: string | null;
}

export interface LockView {
  runId: string;
  stage: string;
  pid: number;
  acquiredAt: string;
}

export interface StageView {
  name: string;
  status: StageStatus;
  running: boolean;
  comment?: string | null;
  lastRun?: LastRunSummary | null;
}

export interface Pipeline {
  locked: boolean;
  lock?: LockView | null;
  stages: StageView[];
}

export interface ToolCallLogEntry {
  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage';
  args: Record<string, unknown>;
  result: 'ok' | 'error';
  errorMessage?: string;
  timestamp: string;
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
}

export interface TreeEntry {
  path: string;
  type: 'file' | 'dir';
}

export interface FileContent {
  path: string;
  content: string;
}

export interface DiffResult {
  path: string;
  ref: string;
  diff: string;
}

export interface LogEntry {
  sha: string;
  message: string;
  date: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}

const BASE_URL = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no JSON body on this error response
    }
    throw new ApiError(res.status, body);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function getPipeline(): Promise<Pipeline> {
  return request<Pipeline>('/pipeline');
}

export function runStage(stage: string): Promise<void> {
  return request<void>(`/stages/${stage}/run`, { method: 'POST' });
}

export function approveStage(stage: string): Promise<void> {
  return request<void>(`/stages/${stage}/approve`, { method: 'POST' });
}

export function rejectStage(stage: string, comment: string): Promise<void> {
  return request<void>(`/stages/${stage}/reject`, { method: 'POST', body: JSON.stringify({ comment }) });
}

export function getRun(runId: string): Promise<RunLog> {
  return request<RunLog>(`/runs/${encodeURIComponent(runId)}`);
}

export function getFile(path: string): Promise<FileContent> {
  return request<FileContent>(`/files?path=${encodeURIComponent(path)}`);
}

export function putFile(path: string, content: string): Promise<void> {
  return request<void>(`/files?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export function getTree(): Promise<TreeEntry[]> {
  return request<TreeEntry[]>('/tree');
}

export function getDiff(path: string, ref = 'HEAD~1'): Promise<DiffResult> {
  return request<DiffResult>(`/diff?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`);
}

export function getLog(limit = 50): Promise<LogEntry[]> {
  return request<LogEntry[]>(`/log?limit=${limit}`);
}
