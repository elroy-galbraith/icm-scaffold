import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPipeline,
  runStage,
  approveStage,
  rejectStage,
  getTree,
  getFile,
  putFile,
  getDiff,
  getRun,
  ApiError,
  type StageStatus,
} from '../api/client.js';
import { StageCard } from '../components/StageCard.js';
import { MarkdownViewer } from '../components/MarkdownViewer.js';
import { MarkdownEditor } from '../components/MarkdownEditor.js';
import { DiffView } from '../components/DiffView.js';
import { RunLogPanel } from '../components/RunLogPanel.js';
import { Sheet } from '../components/ui/Sheet.js';
import { Button } from '../components/ui/Button.js';

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

export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as Record<string, unknown>;
    if (err.status === 409 && typeof body.runId === 'string') {
      return `Locked: run ${body.runId} is in progress on stage ${String(body.stage)}.`;
    }
    if (err.status === 409 && typeof body.status === 'string') {
      return `Stage ${String(body.stage)} is ${body.status}, not awaiting review.`;
    }
    if (err.status === 422 && typeof body.blockingStage === 'string') {
      return `Blocked: ${body.blockingStage} is ${String(body.blockingStatus)}, must be approved first.`;
    }
    if (err.status === 403 && typeof body.error === 'string') {
      return `Forbidden: ${body.error}`;
    }
    return `API error ${err.status}`;
  }
  return err instanceof Error ? err.message : 'Unknown error';
}

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
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pipeline'],
    queryFn: getPipeline,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const treeQuery = useQuery({ queryKey: ['tree'], queryFn: getTree, refetchInterval: POLL_INTERVAL_MS });
  const fileQuery = useQuery({
    queryKey: ['file', selectedPath],
    queryFn: () => getFile(selectedPath as string),
    enabled: selectedPath !== null,
  });
  const diffQuery = useQuery({
    queryKey: ['diff', selectedPath],
    queryFn: () => getDiff(selectedPath as string),
    enabled: selectedPath !== null,
  });
  const runLogQuery = useQuery({
    queryKey: ['run', selectedRunId],
    queryFn: () => getRun(selectedRunId as string),
    enabled: selectedRunId !== null,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipeline'] });

  // Toasts are a list, not a single slot: multiple mutations (e.g. a Run 409 on one stage and
  // an Approve 422 on another) can fail around the same time, and each failure names a specific
  // stage/reason the user needs to see. A single "current error" slot would silently drop an
  // earlier still-relevant error the moment a second one lands. Each toast gets its own id so
  // it can be dismissed independently of the others.
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const nextToastId = useRef(0);
  const pushToast = (message: string) => {
    const id = nextToastId.current++;
    setToasts((t) => [...t, { id, message }]);
  };
  const dismissToast = (id: number) => setToasts((t) => t.filter((toast) => toast.id !== id));

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
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, stage) => setPendingRuns((prev) => removeFrom(prev, stage)),
  });
  const approveMutation = useMutation({
    mutationFn: (stage: string) => approveStage(stage),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, stage) => setPendingApprovals((prev) => removeFrom(prev, stage)),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ stage, comment }: { stage: string; comment: string }) => rejectStage(stage, comment),
    onSuccess: invalidate,
    onError: (err) => {
      pushToast(describeApiError(err));
      invalidate();
    },
    onSettled: (_data, _error, variables) => setPendingRejections((prev) => removeFrom(prev, variables.stage)),
  });
  const saveFileMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => putFile(path, content),
    // `saveFileMutation` is a single shared mutation object (mirroring the run/approve/reject
    // mutations above), so a save for file A can still be in flight after the user has already
    // navigated to file B and started editing it (selectedPath/editing describe B by then).
    // Only collapse the editor back to the viewer if the file we just saved is still the one
    // selected — otherwise this would unmount B's MarkdownEditor and silently discard whatever
    // the user had typed into it. We deliberately don't also disable file-tree navigation or the
    // edit toggle while a save is pending: browsing to and editing an unrelated file during a
    // save is legitimate, and this variables.path === selectedPath check alone is sufficient to
    // keep the single "currently edited file" slot consistent.
    onSuccess: (_data, variables) => {
      if (variables.path === selectedPath) {
        setEditing(false);
      }
      queryClient.invalidateQueries({ queryKey: ['file', variables.path] });
      queryClient.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: (err) => pushToast(describeApiError(err)),
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
    return (
      <p data-testid="pipeline-loading" className="p-6 text-sm text-muted">
        Loading pipeline…
      </p>
    );
  }
  if (isError || !data) {
    return (
      <p data-testid="pipeline-error" className="p-6 text-sm text-status-rejected">
        Failed to load the pipeline.
      </p>
    );
  }

  const files = (treeQuery.data ?? []).filter((entry) => entry.type === 'file');

  return (
    <div className="flex h-screen flex-col bg-canvas text-ink">
      {toasts.length > 0 && (
        <div data-testid="toast-list" className="fixed right-4 top-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              data-testid={`toast-${toast.id}`}
              className="flex items-start justify-between gap-3 rounded border border-status-rejected bg-white px-4 py-3 text-xs text-status-rejected shadow-md"
            >
              <span>{toast.message}</span>
              <button
                type="button"
                data-testid={`toast-dismiss-${toast.id}`}
                onClick={() => dismissToast(toast.id)}
                className="font-semibold text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <header className="border-b border-border px-6 py-4">
        <h1 className="font-serif text-2xl font-bold text-ink">ICM Pipeline</h1>
        {data.locked && (
          <p
            data-testid="pipeline-locked"
            className="mt-1 text-xs font-semibold uppercase tracking-wide text-status-review"
          >
            A run is in progress — actions are disabled workspace-wide.
          </p>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border px-4 py-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Files</h2>
          <ul data-testid="file-tree" className="space-y-1">
            {files.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  data-testid={`file-tree-entry-${entry.path}`}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setEditing(false);
                  }}
                  className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-white ${
                    selectedPath === entry.path ? 'bg-white font-semibold text-ink' : 'text-muted'
                  }`}
                >
                  {entry.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div data-testid="stage-list" className="flex flex-wrap gap-3">
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
                onViewRun={(runId) => setSelectedRunId(runId)}
              />
            ))}
          </div>

          {selectedPath && fileQuery.data && (
            <section className="flex flex-1 flex-col gap-3 rounded border border-border bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-lg font-bold text-ink">{selectedPath}</h2>
                <Button type="button" variant="secondary" data-testid="file-edit-toggle" onClick={() => setEditing((e) => !e)}>
                  {editing ? 'View' : 'Edit'}
                </Button>
              </div>
              {editing ? (
                <MarkdownEditor
                  path={selectedPath}
                  initialContent={fileQuery.data.content}
                  saving={saveFileMutation.isPending}
                  onSave={(content) => saveFileMutation.mutate({ path: selectedPath, content })}
                />
              ) : (
                <MarkdownViewer content={fileQuery.data.content} />
              )}
              <DiffView diff={diffQuery.data?.diff ?? ''} path={selectedPath} />
            </section>
          )}
        </main>
      </div>

      <Sheet
        open={selectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null);
        }}
        title="Run log"
      >
        {runLogQuery.data && <RunLogPanel runLog={runLogQuery.data} />}
      </Sheet>
    </div>
  );
}
