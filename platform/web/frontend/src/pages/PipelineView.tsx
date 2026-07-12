import { useQuery } from '@tanstack/react-query';
import { getPipeline } from '../api/client.js';

export const POLL_INTERVAL_MS = 2000;

export function PipelineView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline'],
    queryFn: getPipeline,
    refetchInterval: POLL_INTERVAL_MS,
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
      <ul data-testid="stage-list">
        {data.stages.map((stage) => {
          const failed =
            stage.lastRun && (stage.lastRun.status === 'error' || stage.lastRun.status === 'aborted_budget');
          return (
            <li key={stage.name} data-testid={`stage-row-${stage.name}`}>
              <span>{stage.name}</span>
              <span> — {stage.status}</span>
              {stage.running && <span data-testid={`stage-running-${stage.name}`}> (running)</span>}
              {failed && (
                <span data-testid={`stage-failure-${stage.name}`}>
                  {' '}
                  — last run {stage.lastRun!.status}: {stage.lastRun!.errorMessage}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
