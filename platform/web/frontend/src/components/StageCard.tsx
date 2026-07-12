import type { StageStatus, StageView } from '../api/client.js';
import { GateActions } from './GateActions.js';

export interface StageCardProps {
  stage: StageView;
  workspaceLocked: boolean;
  blockedBy?: { stage: string; status: StageStatus } | null;
  isRunPending?: boolean;
  isApprovePending?: boolean;
  isRejectPending?: boolean;
  onRun: (stage: string) => void;
  onApprove: (stage: string) => void;
  onReject: (stage: string, comment: string) => void;
  onViewRun?: (runId: string) => void;
}

export function StageCard({
  stage,
  workspaceLocked,
  blockedBy,
  isRunPending = false,
  isApprovePending = false,
  isRejectPending = false,
  onRun,
  onApprove,
  onReject,
  onViewRun,
}: StageCardProps) {
  const failed =
    stage.status === 'pending' &&
    stage.lastRun != null &&
    (stage.lastRun.status === 'error' || stage.lastRun.status === 'aborted_budget');

  const runDisabled = workspaceLocked || stage.running || blockedBy != null || isRunPending;
  const runTitle = blockedBy
    ? `Blocked: ${blockedBy.stage} is ${blockedBy.status}, must be approved first.`
    : undefined;
  // GateActions exposes a single `disabled` flag covering both Approve and Reject (they're
  // mutually exclusive actions on the same gate), so fold the two independently-tracked
  // pending flags into it here rather than narrowing GateActions's contract.
  const gateDisabled = workspaceLocked || isApprovePending || isRejectPending;

  return (
    <section data-testid={`stagecard-${stage.name}`}>
      <h2>{stage.name}</h2>
      <span data-testid={`stagecard-status-${stage.name}`}>{stage.status}</span>
      {stage.running && <span data-testid={`stagecard-running-${stage.name}`}> Running…</span>}
      {failed && stage.lastRun && (
        <p data-testid={`stagecard-failure-${stage.name}`}>
          Last run {stage.lastRun.status}: {stage.lastRun.errorMessage} ({stage.lastRun.tokensSpent}/
          {stage.lastRun.tokenBudget} tokens)
        </p>
      )}

      {stage.status === 'rejected' && stage.comment && (
        <p data-testid={`stagecard-comment-${stage.name}`}>Rejected: {stage.comment}</p>
      )}

      {stage.lastRun && onViewRun && (
        <button
          type="button"
          data-testid={`stagecard-viewrun-${stage.name}`}
          onClick={() => onViewRun(stage.lastRun!.runId)}
        >
          View last run
        </button>
      )}

      {!stage.running && (
        <button
          type="button"
          data-testid={`stagecard-run-${stage.name}`}
          disabled={runDisabled}
          title={runTitle}
          onClick={() => onRun(stage.name)}
        >
          Run
        </button>
      )}

      {stage.status === 'awaiting_review' && (
        <GateActions stage={stage.name} disabled={gateDisabled} onApprove={onApprove} onReject={onReject} />
      )}
    </section>
  );
}
