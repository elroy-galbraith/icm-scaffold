import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPipeline, runStage, approveStage, rejectStage, type StageStatus } from '../api/client.js';
import { StageCard } from '../components/StageCard.js';

function addTo(set: Set<string>, name: string): Set<string> {
  const next = new Set(set);
  next.add(name);
  return next;
}

function removeFrom(set: Set<string>, name: string): Set<string> {
  const next = new Set(set);
  next.delete(name);
  return next;
}

export const POLL_INTERVAL_MS = 2000;

function computeBlockedBy(
  stages: Array<{ name: string; status: StageStatus }>,
  stageName: string
): { stage: string; status: StageStatus } | null {
  for (const s of stages) {
    if (s.name >= stageName) break;
    if (s.status !== 'approved') {
      return { stage: s.name, status: s.status };
    }
  }
  return null;
}

export function PipelineView() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline'],
    queryFn: getPipeline,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipeline'] });

  // Each mutation below is a single shared object reused across every StageCard, so
  // `mutation.variables`/`mutation.isPending` only ever reflects the single most recent
  // `.mutate()` call — it cannot represent "stage A is still in flight while stage B was
  // just kicked off too". We track the actual set of in-flight stage names explicitly so
  // N stages can have independent pending state simultaneously.
  const [pendingRuns, setPendingRuns] = useState<Set<string>>(new Set());
  const [pendingApprovals, setPendingApprovals] = useState<Set<string>>(new Set());
  const [pendingRejections, setPendingRejections] = useState<Set<string>>(new Set());

  const runMutation = useMutation({
    mutationFn: (stage: string) => runStage(stage),
    onSuccess: invalidate,
    // Error surfacing (toasts naming the 409/422 detail) is added in Task 18.
    onError: () => invalidate(),
    onSettled: (_data, _error, stage) => setPendingRuns((prev) => removeFrom(prev, stage)),
  });
  const approveMutation = useMutation({
    mutationFn: (stage: string) => approveStage(stage),
    onSuccess: invalidate,
    onError: () => invalidate(),
    onSettled: (_data, _error, stage) => setPendingApprovals((prev) => removeFrom(prev, stage)),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ stage, comment }: { stage: string; comment: string }) => rejectStage(stage, comment),
    onSuccess: invalidate,
    onError: () => invalidate(),
    onSettled: (_data, _error, variables) => setPendingRejections((prev) => removeFrom(prev, variables.stage)),
  });

  const handleRun = (stage: string) => {
    setPendingRuns((prev) => addTo(prev, stage));
    runMutation.mutate(stage);
  };
  const handleApprove = (stage: string) => {
    setPendingApprovals((prev) => addTo(prev, stage));
    approveMutation.mutate(stage);
  };
  const handleReject = (stage: string, comment: string) => {
    setPendingRejections((prev) => addTo(prev, stage));
    rejectMutation.mutate({ stage, comment });
  };

  if (isLoading) {
    return <p data-testid="pipeline-loading">Loading pipeline…</p>;
  }
  if (isError || !data) {
    return <p data-testid="pipeline-error">Failed to load the pipeline.</p>;
  }

  return (
    <main>
      <h1>ICM Pipeline</h1>
      {data.locked && (
        <p data-testid="pipeline-locked">A run is in progress — actions are disabled workspace-wide.</p>
      )}
      <div data-testid="stage-list">
        {data.stages.map((stage) => (
          <StageCard
            key={stage.name}
            stage={stage}
            workspaceLocked={data.locked}
            blockedBy={computeBlockedBy(data.stages, stage.name)}
            isRunPending={pendingRuns.has(stage.name)}
            isApprovePending={pendingApprovals.has(stage.name)}
            isRejectPending={pendingRejections.has(stage.name)}
            onRun={handleRun}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ))}
      </div>
    </main>
  );
}
