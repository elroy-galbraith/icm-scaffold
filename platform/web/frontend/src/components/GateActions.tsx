import { useState } from 'react';
import { Button } from './ui/Button.js';

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
    <div data-testid={`gate-actions-${stage}`} className="flex flex-col gap-2 border-t border-border pt-2">
      <Button
        type="button"
        variant="primary"
        data-testid={`gate-approve-${stage}`}
        disabled={disabled}
        onClick={() => onApprove(stage)}
      >
        Approve
      </Button>
      <textarea
        data-testid={`gate-reject-comment-${stage}`}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Reason for rejecting"
        aria-label="Reason for rejecting"
        className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <Button
        type="button"
        variant="destructive"
        data-testid={`gate-reject-submit-${stage}`}
        disabled={disabled || !canReject}
        onClick={() => {
          onReject(stage, comment);
          setComment('');
        }}
      >
        Reject
      </Button>
    </div>
  );
}
