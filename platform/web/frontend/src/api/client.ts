import type {
  RunLog,
  TreeEntry,
  DiffResult,
  LogEntry,
  PipelineView as Pipeline,
} from 'icm-web-shared';
export type {
  StageStatus,
  RunStatus,
  LastRunSummary,
  StageView,
  ToolCallLogEntry,
  RunLog,
  TreeEntry,
  DiffResult,
  LogEntry,
} from 'icm-web-shared';
export type { PipelineView as Pipeline, LockInfo as LockView } from 'icm-web-shared';

export interface FileContent {
  path: string;
  content: string;
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
