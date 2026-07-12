import type { StageStatus, StageView } from '../api/client.js';
import { GateActions } from './GateActions.js';
import { Card } from './ui/Card.js';
import { Badge } from './ui/Badge.js';
import { Button } from './ui/Button.js';

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

const STATUS_TONE: Record<StageStatus, 'approved' | 'review' | 'rejected' | 'pending'> = {
  approved: 'approved',
  awaiting_review: 'review',
  rejected: 'rejected',
  pending: 'pending',
};

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
  const gateDisabled = workspaceLocked || isApprovePending || isRejectPending;

  return (
    <Card data-testid={`stagecard-${stage.name}`} className="flex min-w-[220px] flex-1 flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-base font-bold text-ink">{stage.name}</h2>
        <Badge tone={STATUS_TONE[stage.status]} data-testid={`stagecard-status-${stage.name}`}>
          {stage.status}
        </Badge>
      </div>

      {stage.running && (
        <span data-testid={`stagecard-running-${stage.name}`} className="text-xs text-muted">
          {' '}
          Running…
        </span>
      )}

      {failed && stage.lastRun && (
        <p
          data-testid={`stagecard-failure-${stage.name}`}
          className="rounded bg-status-rejected-bg px-3 py-2 text-xs text-status-rejected"
        >
          Last run {stage.lastRun.status}: {stage.lastRun.errorMessage} ({stage.lastRun.tokensSpent}/
          {stage.lastRun.tokenBudget} tokens)
        </p>
      )}

      {stage.status === 'rejected' && stage.comment && (
        <p
          data-testid={`stagecard-comment-${stage.name}`}
          className="rounded bg-status-pending-bg px-3 py-2 text-xs text-ink"
        >
          Rejected: {stage.comment}
        </p>
      )}

      {stage.lastRun && onViewRun && (
        <Button
          type="button"
          variant="secondary"
          data-testid={`stagecard-viewrun-${stage.name}`}
          onClick={() => onViewRun(stage.lastRun!.runId)}
        >
          View last run
        </Button>
      )}

      {!stage.running && stage.status !== 'awaiting_review' && (
        <Button
          type="button"
          variant="primary"
          data-testid={`stagecard-run-${stage.name}`}
          disabled={runDisabled}
          title={runTitle}
          onClick={() => onRun(stage.name)}
        >
          Run
        </Button>
      )}

      {stage.status === 'awaiting_review' && (
        <GateActions stage={stage.name} disabled={gateDisabled} onApprove={onApprove} onReject={onReject} />
      )}
    </Card>
  );
}
