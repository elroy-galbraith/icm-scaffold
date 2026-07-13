import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageCard } from './StageCard.js';
import type { StageView } from '../api/client.js';

function makeStage(overrides: Partial<StageView> = {}): StageView {
  return { name: '03_report', status: 'pending', running: false, ...overrides };
}

describe('StageCard', () => {
  it('shows the stage name and status badge', () => {
    render(
      <StageCard stage={makeStage()} workspaceLocked={false} onRun={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />
    );
    expect(screen.getByTestId('stagecard-03_report')).toHaveTextContent('03_report');
    expect(screen.getByTestId('stagecard-status-03_report')).toHaveTextContent('pending');
  });

  it('shows a running indicator and hides the Run button while running', () => {
    render(
      <StageCard
        stage={makeStage({ running: true })}
        workspaceLocked={true}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('stagecard-running-03_report')).toBeInTheDocument();
    expect(screen.queryByTestId('stagecard-run-03_report')).not.toBeInTheDocument();
  });

  it('shows a failure banner for a pending stage whose last run errored', () => {
    render(
      <StageCard
        stage={makeStage({
          lastRun: {
            runId: 'run-1',
            status: 'aborted_budget',
            endedAt: '2026-07-12T09:00:00.000Z',
            tokensSpent: 200000,
            tokenBudget: 200000,
            errorMessage: 'Token budget exceeded',
          },
        })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('stagecard-failure-03_report')).toHaveTextContent('Token budget exceeded');
  });

  it('shows the stored rejection comment for a rejected stage', () => {
    render(
      <StageCard
        stage={makeStage({ status: 'rejected', comment: 'too shallow' })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('stagecard-comment-03_report')).toHaveTextContent('too shallow');
  });

  it('calls onRun with the stage name when Run is clicked', () => {
    const onRun = vi.fn();
    render(<StageCard stage={makeStage()} workspaceLocked={false} onRun={onRun} onApprove={vi.fn()} onReject={vi.fn()} />);
    fireEvent.click(screen.getByTestId('stagecard-run-03_report'));
    expect(onRun).toHaveBeenCalledWith('03_report');
  });

  it('disables Run and shows the blocking reason when blockedBy is set', () => {
    render(
      <StageCard
        stage={makeStage()}
        workspaceLocked={false}
        blockedBy={{ stage: '02_analysis', status: 'pending' }}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    const button = screen.getByTestId('stagecard-run-03_report');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringContaining('02_analysis'));
  });

  it('disables Run when the workspace is locked', () => {
    render(
      <StageCard stage={makeStage()} workspaceLocked={true} onRun={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} />
    );
    expect(screen.getByTestId('stagecard-run-03_report')).toBeDisabled();
  });

  it('shows Approve/Reject only when awaiting_review, and calls onApprove', () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <StageCard stage={makeStage()} workspaceLocked={false} onRun={vi.fn()} onApprove={onApprove} onReject={vi.fn()} />
    );
    expect(screen.queryByTestId('gate-approve-03_report')).not.toBeInTheDocument();

    rerender(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('gate-approve-03_report'));
    expect(onApprove).toHaveBeenCalledWith('03_report');
  });

  it('requires a non-empty comment before Reject can be submitted', () => {
    const onReject = vi.fn();
    render(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    const submit = screen.getByTestId('gate-reject-submit-03_report');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('gate-reject-comment-03_report'), { target: { value: 'too shallow' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(onReject).toHaveBeenCalledWith('03_report', 'too shallow');
  });

  it('disables Approve/Reject when the workspace is locked', () => {
    render(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={true}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('gate-approve-03_report')).toBeDisabled();
    expect(screen.getByTestId('gate-reject-submit-03_report')).toBeDisabled();
  });

  it('shows a failure banner for a pending stage whose last run errored with status "error"', () => {
    render(
      <StageCard
        stage={makeStage({
          lastRun: {
            runId: 'run-1',
            status: 'error',
            endedAt: '2026-07-12T09:00:00.000Z',
            tokensSpent: 500,
            tokenBudget: 200000,
            errorMessage: 'Tool call failed',
          },
        })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('stagecard-failure-03_report')).toHaveTextContent('Tool call failed');
  });

  it('disables Run while a run mutation is pending for this stage', () => {
    render(
      <StageCard
        stage={makeStage()}
        workspaceLocked={false}
        isRunPending={true}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('stagecard-run-03_report')).toBeDisabled();
  });

  it('disables Approve while an approve mutation is pending for this stage', () => {
    render(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={false}
        isApprovePending={true}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByTestId('gate-approve-03_report')).toBeDisabled();
  });

  it('disables Reject-submit while a reject mutation is pending for this stage, even with a comment', () => {
    render(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={false}
        isRejectPending={true}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('gate-reject-comment-03_report'), { target: { value: 'too shallow' } });
    expect(screen.getByTestId('gate-reject-submit-03_report')).toBeDisabled();
  });

  it('renders a "View last run" button when lastRun and onViewRun are both provided', () => {
    const onViewRun = vi.fn();
    render(
      <StageCard
        stage={makeStage({
          status: 'approved',
          lastRun: {
            runId: 'run-1',
            status: 'completed',
            endedAt: '2026-07-12T09:00:00.000Z',
            tokensSpent: 800,
            tokenBudget: 200000,
          },
        })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onViewRun={onViewRun}
      />
    );
    fireEvent.click(screen.getByTestId('stagecard-viewrun-03_report'));
    expect(onViewRun).toHaveBeenCalledWith('run-1');
  });

  it('hides the Run button when the stage is already awaiting_review, showing GateActions instead', () => {
    render(
      <StageCard
        stage={makeStage({ status: 'awaiting_review' })}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByTestId('stagecard-run-03_report')).not.toBeInTheDocument();
    expect(screen.getByTestId('gate-approve-03_report')).toBeInTheDocument();
  });

  it('does not render "View last run" when there is no lastRun', () => {
    render(
      <StageCard
        stage={makeStage()}
        workspaceLocked={false}
        onRun={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onViewRun={vi.fn()}
      />
    );
    expect(screen.queryByTestId('stagecard-viewrun-03_report')).not.toBeInTheDocument();
  });

  it('calls onSelectStage with the stage name when the header is clicked, without triggering Run', () => {
    const onSelectStage = vi.fn();
    const onRun = vi.fn();
    render(
      <StageCard
        stage={makeStage()}
        workspaceLocked={false}
        onRun={onRun}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSelectStage={onSelectStage}
      />
    );
    fireEvent.click(screen.getByTestId('stagecard-header-03_report'));
    expect(onSelectStage).toHaveBeenCalledWith('03_report');
    expect(onRun).not.toHaveBeenCalled();
  });
});
