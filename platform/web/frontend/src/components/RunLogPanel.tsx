import type { RunLog, ToolCallLogEntry } from '../api/client.js';

export interface RunLogPanelProps {
  runLog: RunLog;
}

/** Safely reads the `path` arg from a tool call, when present (read_file, write_file, list_dir). */
function toolCallPath(call: ToolCallLogEntry): string | undefined {
  const path = call.args.path;
  return typeof path === 'string' ? path : undefined;
}

export function RunLogPanel({ runLog }: RunLogPanelProps) {
  return (
    <div data-testid="run-log-panel">
      <h3>Run {runLog.runId}</h3>
      <dl>
        <dt>Stage</dt>
        <dd data-testid="run-log-stage">{runLog.stage}</dd>
        <dt>Model</dt>
        <dd data-testid="run-log-model">{runLog.model}</dd>
        <dt>Status</dt>
        <dd data-testid="run-log-status">{runLog.status}</dd>
        <dt>Tokens</dt>
        <dd data-testid="run-log-tokens">
          {runLog.tokensSpent} / {runLog.tokenBudget}
        </dd>
      </dl>

      <h4>Files read</h4>
      <ul data-testid="run-log-files-read">
        {runLog.filesRead.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>

      <h4>Files written</h4>
      <ul data-testid="run-log-files-written">
        {runLog.filesWritten.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>

      <h4>Tool calls</h4>
      <ul data-testid="run-log-tool-calls">
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

      {runLog.gateSummary && <p data-testid="run-log-gate-summary">{runLog.gateSummary}</p>}
      {runLog.errorMessage && <p data-testid="run-log-error">{runLog.errorMessage}</p>}
    </div>
  );
}
