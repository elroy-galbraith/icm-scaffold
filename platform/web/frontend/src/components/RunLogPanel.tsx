import type { RunLog, ToolCallLogEntry } from '../api/client.js';
import { Separator } from './ui/Separator.js';

export interface RunLogPanelProps {
  runLog: RunLog;
}

/** Safely reads the `path` arg from a tool call, when present (read_file, write_file, list_dir). */
function toolCallPath(call: ToolCallLogEntry): string | undefined {
  const path = call.args?.path;
  return typeof path === 'string' ? path : undefined;
}

export function RunLogPanel({ runLog }: RunLogPanelProps) {
  return (
    <div data-testid="run-log-panel" className="flex flex-col gap-4 text-sm">
      <h3 className="font-serif text-base font-bold text-ink">Run {runLog.runId}</h3>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted">Stage</dt>
        <dd data-testid="run-log-stage" className="text-ink">
          {runLog.stage}
        </dd>
        <dt className="text-muted">Model</dt>
        <dd data-testid="run-log-model" className="text-ink">
          {runLog.model}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd data-testid="run-log-status" className="text-ink">
          {runLog.status}
        </dd>
        <dt className="text-muted">Tokens</dt>
        <dd data-testid="run-log-tokens" className="text-ink">
          {runLog.tokensSpent} / {runLog.tokenBudget}
        </dd>
      </dl>

      <Separator />

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Files read</h4>
        <ul data-testid="run-log-files-read" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.filesRead.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Files written</h4>
        <ul data-testid="run-log-files-written" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.filesWritten.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>

      <Separator />

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tool calls</h4>
        <ul data-testid="run-log-tool-calls" className="space-y-0.5 font-mono text-xs text-ink">
          {runLog.toolCalls.map((call, index) => {
            const path = toolCallPath(call);
            return (
              <li key={index} data-testid={`run-log-tool-call-${index}`}>
                {call.tool}
                {path ? ` (${path})` : ''} — {call.result}
                {call.errorMessage ? `: ${call.errorMessage}` : ''}
              </li>
            );
          })}
        </ul>
      </div>

      {runLog.gateSummary && (
        <p
          data-testid="run-log-gate-summary"
          className="rounded bg-status-approved-bg px-3 py-2 text-xs text-status-approved"
        >
          {runLog.gateSummary}
        </p>
      )}
      {runLog.errorMessage && (
        <p
          data-testid="run-log-error"
          className="rounded bg-status-rejected-bg px-3 py-2 text-xs text-status-rejected"
        >
          {runLog.errorMessage}
        </p>
      )}
    </div>
  );
}
