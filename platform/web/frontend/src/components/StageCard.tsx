import { useState } from 'react';
import type { StageStatus, StageView } from '../api/client.js';

export interface StageCardProps {
  stage: StageView;
  workspaceLocked: boolean;
  blockedBy?: { stage: string; status: StageStatus } | null;
  onRun: (stage: string) => void;
  onApprove: (stage: string) => void;
  onReject: (stage: string, comment: string) => void;
}

export function StageCard({ stage, workspaceLocked, blockedBy, onRun, onApprove, onReject }: StageCardProps) {
  const [comment, setComment] = useState('');
  const failed =
    stage.status === 'pending' &&
    stage.lastRun != null &&
    (stage.lastRun.status === 'error' || stage.lastRun.status === 'aborted_budget');

  const runDisabled = workspaceLocked || stage.running || blockedBy != null;
  const runTitle = blockedBy
    ? `Blocked: ${blockedBy.stage} is ${blockedBy.status}, must be approved first.`
    : undefined;

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
        <div>
          <button
            type="button"
            data-testid={`stagecard-approve-${stage.name}`}
            disabled={workspaceLocked}
            onClick={() => onApprove(stage.name)}
          >
            Approve
          </button>
          <textarea
            data-testid={`stagecard-reject-comment-${stage.name}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reason for rejecting"
          />
          <button
            type="button"
            data-testid={`stagecard-reject-submit-${stage.name}`}
            disabled={workspaceLocked || comment.trim().length === 0}
            onClick={() => onReject(stage.name, comment)}
          >
            Reject
          </button>
        </div>
      )}
    </section>
  );
}
