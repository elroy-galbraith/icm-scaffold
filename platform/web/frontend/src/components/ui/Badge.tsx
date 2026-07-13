import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type BadgeTone = 'approved' | 'review' | 'rejected' | 'pending';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  approved: 'bg-status-approved-bg text-status-approved',
  review: 'bg-status-review-bg text-status-review',
  rejected: 'bg-status-rejected-bg text-status-rejected',
  pending: 'bg-status-pending-bg text-status-pending',
};

export function Badge({ tone, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  );
}
