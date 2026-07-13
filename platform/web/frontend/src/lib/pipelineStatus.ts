import type { StageStatus, StageView } from '../api/client.js';

export interface BlockedBy {
  stage: string;
  status: StageStatus;
}

export function computeBlockedBy(stages: StageView[], stageName: string): BlockedBy | null {
  for (const s of stages) {
    if (s.name >= stageName) break;
    if (s.status !== 'approved') {
      return { stage: s.name, status: s.status };
    }
  }
  return null;
}

export function computeFocusStage(stages: StageView[]): string | null {
  if (stages.length === 0) return null;

  for (const s of stages) {
    if (s.status === 'awaiting_review' || s.status === 'rejected') {
      return s.name;
    }
  }

  for (const s of stages) {
    if (s.status === 'pending' && computeBlockedBy(stages, s.name) === null) {
      return s.name;
    }
  }

  return stages[stages.length - 1].name;
}
