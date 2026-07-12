import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunLogPanel } from './RunLogPanel.js';
import type { RunLog } from '../api/client.js';

const COMPLETED_LOG: RunLog = {
  runId: 'run-1',
  stage: '03_report',
  model: 'anthropic/claude-sonnet-5',
  startedAt: '2026-07-12T09:00:00.000Z',
  endedAt: '2026-07-12T09:00:03.000Z',
  status: 'completed',
  filesRead: ['shared/client-brief.md'],
  filesWritten: ['stages/03_report/output/report.md'],
  toolCalls: [
    { tool: 'read_file', args: { path: 'shared/client-brief.md' }, result: 'ok', timestamp: '2026-07-12T09:00:01.000Z' },
    { tool: 'finish_stage', args: { gateSummary: 'Done.' }, result: 'ok', timestamp: '2026-07-12T09:00:02.000Z' },
  ],
  tokensSpent: 800,
  tokenBudget: 200000,
  gateSummary: 'Completed 03_report. Verify: report is non-empty.',
};

describe('RunLogPanel', () => {
  it('renders stage, model, status, and token spend', () => {
    render(<RunLogPanel runLog={COMPLETED_LOG} />);
    expect(screen.getByTestId('run-log-stage')).toHaveTextContent('03_report');
    expect(screen.getByTestId('run-log-model')).toHaveTextContent('anthropic/claude-sonnet-5');
    expect(screen.getByTestId('run-log-status')).toHaveTextContent('completed');
    expect(screen.getByTestId('run-log-tokens')).toHaveTextContent('800');
    expect(screen.getByTestId('run-log-tokens')).toHaveTextContent('200000');
  });

  it('lists files read and written, and tool calls', () => {
    render(<RunLogPanel runLog={COMPLETED_LOG} />);
    expect(screen.getByTestId('run-log-files-read')).toHaveTextContent('shared/client-brief.md');
    expect(screen.getByTestId('run-log-files-written')).toHaveTextContent('stages/03_report/output/report.md');
    expect(screen.getByTestId('run-log-tool-call-0')).toHaveTextContent('read_file');
    expect(screen.getByTestId('run-log-tool-call-1')).toHaveTextContent('finish_stage');
  });

  it('shows the target file path for a write_file tool-call entry', () => {
    const logWithWrite: RunLog = {
      ...COMPLETED_LOG,
      toolCalls: [
        ...COMPLETED_LOG.toolCalls,
        {
          tool: 'write_file',
          args: { path: 'stages/03_report/output/report.md' },
          result: 'ok',
          timestamp: '2026-07-12T09:00:01.500Z',
        },
      ],
    };
    render(<RunLogPanel runLog={logWithWrite} />);
    expect(screen.getByTestId('run-log-tool-call-2')).toHaveTextContent('write_file');
    expect(screen.getByTestId('run-log-tool-call-2')).toHaveTextContent(
      'stages/03_report/output/report.md'
    );
  });

  it('renders a finish_stage entry (no path arg) without crashing or showing garbage', () => {
    render(<RunLogPanel runLog={COMPLETED_LOG} />);
    const finishEntry = screen.getByTestId('run-log-tool-call-1');
    expect(finishEntry).toHaveTextContent('finish_stage');
    expect(finishEntry).not.toHaveTextContent('undefined');
    expect(finishEntry).not.toHaveTextContent('[object Object]');
  });

  it('shows the gate summary for a completed run', () => {
    render(<RunLogPanel runLog={COMPLETED_LOG} />);
    expect(screen.getByTestId('run-log-gate-summary')).toHaveTextContent('Verify: report is non-empty.');
  });

  it('shows the error message for a failed run', () => {
    render(
      <RunLogPanel
        runLog={{
          ...COMPLETED_LOG,
          status: 'error',
          gateSummary: undefined,
          errorMessage: 'Too many consecutive tool errors',
        }}
      />
    );
    expect(screen.getByTestId('run-log-error')).toHaveTextContent('Too many consecutive tool errors');
    expect(screen.queryByTestId('run-log-gate-summary')).not.toBeInTheDocument();
  });

  it('does not crash when a tool call has no args (malformed/hand-edited run log)', () => {
    // `args` is required by the type/schema, but the frontend doesn't runtime-validate
    // getRun()'s response — a hand-edited .runner/runs/<id>.json, or a future real
    // backend that isn't byte-for-byte contract-compliant, could omit it.
    const logWithMissingArgs: RunLog = {
      ...COMPLETED_LOG,
      toolCalls: [
        { ...COMPLETED_LOG.toolCalls[0], args: undefined as unknown as Record<string, unknown> },
      ],
    };
    expect(() => render(<RunLogPanel runLog={logWithMissingArgs} />)).not.toThrow();
    expect(screen.getByTestId('run-log-tool-call-0')).toHaveTextContent('read_file');
  });
});
