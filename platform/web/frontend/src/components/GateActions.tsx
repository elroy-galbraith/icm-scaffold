import { useState } from 'react';

export interface GateActionsProps {
  stage: string;
  disabled: boolean;
  onApprove: (stage: string) => void;
  onReject: (stage: string, comment: string) => void;
}

export function GateActions({ stage, disabled, onApprove, onReject }: GateActionsProps) {
  const [comment, setComment] = useState('');
  const canReject = comment.trim().length > 0;

  return (
    <div data-testid={`gate-actions-${stage}`}>
      <button
        type="button"
        data-testid={`gate-approve-${stage}`}
        disabled={disabled}
        onClick={() => onApprove(stage)}
      >
        Approve
      </button>
      <textarea
        data-testid={`gate-reject-comment-${stage}`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Reason for rejecting"
      />
      <button
        type="button"
        data-testid={`gate-reject-submit-${stage}`}
        disabled={disabled || !canReject}
        onClick={() => {
          onReject(stage, comment);
          setComment('');
        }}
      >
        Reject
      </button>
    </div>
  );
}
