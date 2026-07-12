import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPipeline, runStage, approveStage, rejectStage, type StageStatus } from '../api/client.js';
import { StageCard } from '../components/StageCard.js';

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

  const runMutation = useMutation({
    mutationFn: (stage: string) => runStage(stage),
    onSuccess: invalidate,
    // Error surfacing (toasts naming the 409/422 detail) is added in Task 18.
    onError: () => invalidate(),
  });
  const approveMutation = useMutation({
    mutationFn: (stage: string) => approveStage(stage),
    onSuccess: invalidate,
    onError: () => invalidate(),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ stage, comment }: { stage: string; comment: string }) => rejectStage(stage, comment),
    onSuccess: invalidate,
    onError: () => invalidate(),
  });

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
            onRun={(name) => runMutation.mutate(name)}
            onApprove={(name) => approveMutation.mutate(name)}
            onReject={(name, comment) => rejectMutation.mutate({ stage: name, comment })}
          />
        ))}
      </div>
    </main>
  );
}
