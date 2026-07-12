import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineView } from './PipelineView.js';
import { getPipeline, runStage, getTree, getFile, putFile, type Pipeline } from '../api/client.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    getPipeline: vi.fn(),
    runStage: vi.fn(),
    approveStage: vi.fn(),
    rejectStage: vi.fn(),
    // Defaults to an empty tree so tests that don't care about the file sidebar don't hit
    // React Query's "Query data cannot be undefined" warning for the unmocked ['tree'] query
    // (treeQuery fetches unconditionally on every render). Tests that do care override this
    // with their own vi.mocked(getTree).mockResolvedValue(...).
    getTree: vi.fn().mockResolvedValue([]),
    getFile: vi.fn(),
    putFile: vi.fn(),
  };
});

/** Resolves/rejects on demand, so a test can hold a mutation "in flight" indefinitely. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const BASE_PIPELINE: Pipeline = {
  locked: false,
  stages: [
    { name: '01_research', status: 'approved', running: false },
    { name: '02_analysis', status: 'approved', running: false },
    { name: '03_report', status: 'pending', running: false },
  ],
};

describe('PipelineView', () => {
  afterEach(() => {
    vi.mocked(getPipeline).mockReset();
  });

  it('shows a loading state before the first response arrives', () => {
    vi.mocked(getPipeline).mockReturnValue(new Promise(() => {}));
    renderWithClient(<PipelineView />);
    expect(screen.getByTestId('pipeline-loading')).toBeInTheDocument();
  });

  it('renders a StageCard per stage once loaded', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stagecard-03_report')).toBeInTheDocument());
    expect(screen.getByTestId('stagecard-status-01_research')).toHaveTextContent('approved');
    expect(screen.getByTestId('stagecard-status-03_report')).toHaveTextContent('pending');
  });

  it('shows a workspace-locked banner when pipeline.locked is true', async () => {
    vi.mocked(getPipeline).mockResolvedValue({ ...BASE_PIPELINE, locked: true });
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('pipeline-locked')).toBeInTheDocument());
  });

  it('disables Run on a pending stage whose lower-numbered stage is not approved', async () => {
    vi.mocked(getPipeline).mockResolvedValue({
      ...BASE_PIPELINE,
      stages: [
        { name: '01_research', status: 'approved', running: false },
        { name: '02_analysis', status: 'rejected', running: false, comment: 'redo' },
        { name: '03_report', status: 'pending', running: false },
      ],
    });
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stagecard-run-03_report')).toBeInTheDocument());
    const button = screen.getByTestId('stagecard-run-03_report');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringContaining('02_analysis'));
  });

  it('shows an error state when the pipeline fetch rejects', async () => {
    vi.mocked(getPipeline).mockRejectedValue(new Error('network down'));
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('pipeline-error')).toBeInTheDocument());
  });

  it('tracks Run-pending state per stage, so clicking Run on a second stage does not clear the first stage\'s pending state', async () => {
    // Regression test for: PipelineView used to derive each StageCard's isRunPending from
    // `runMutation.isPending && runMutation.variables === stage.name`. Since runMutation is a
    // single shared mutation object reused across every stage, `.variables` only ever reflects
    // the MOST RECENT `.mutate()` call — so starting stage B's run wiped out stage A's pending
    // flag even though A's request was still outstanding, reopening the double-submit hole.
    const runA = deferred<void>();
    const runB = deferred<void>();
    vi.mocked(runStage).mockImplementation((stage: string) => {
      if (stage === '01_research') return runA.promise;
      if (stage === '02_analysis') return runB.promise;
      return Promise.resolve();
    });
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);

    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stagecard-run-01_research')).toBeInTheDocument());

    // Click Run on stage A (01_research); its request is left unresolved.
    fireEvent.click(screen.getByTestId('stagecard-run-01_research'));
    await waitFor(() => expect(screen.getByTestId('stagecard-run-01_research')).toBeDisabled());

    // While A is still in flight, click Run on stage B (02_analysis), also unresolved.
    fireEvent.click(screen.getByTestId('stagecard-run-02_analysis'));
    await waitFor(() => expect(screen.getByTestId('stagecard-run-02_analysis')).toBeDisabled());

    // Both must be disabled simultaneously — this is the exact case the old
    // `mutation.variables`-based scoping got wrong (B's click used to re-enable A).
    expect(screen.getByTestId('stagecard-run-01_research')).toBeDisabled();
    expect(screen.getByTestId('stagecard-run-02_analysis')).toBeDisabled();

    // Resolving A's request re-enables A's button while B's stays disabled, proving the
    // pending state is tracked independently per stage rather than as one shared flag.
    await act(async () => {
      runA.resolve();
      await runA.promise;
    });
    await waitFor(() => expect(screen.getByTestId('stagecard-run-01_research')).not.toBeDisabled());
    expect(screen.getByTestId('stagecard-run-02_analysis')).toBeDisabled();

    // Clean up the still-pending B request so it doesn't leak into other tests.
    await act(async () => {
      runB.resolve();
      await runB.promise;
    });
  });

  it('lists files from the workspace tree in a sidebar', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([
      { path: 'shared', type: 'dir' },
      { path: 'shared/client-brief.md', type: 'file' },
      { path: 'stages', type: 'dir' },
    ]);
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    expect(screen.queryByTestId('file-tree-entry-shared')).not.toBeInTheDocument();
  });

  it('shows the selected file content in MarkdownViewer', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: '# Client Brief' });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));

    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());
    expect(getFile).toHaveBeenCalledWith('shared/client-brief.md');
  });

  it('switches to MarkdownEditor and saves via putFile', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: 'Original brief.' });
    vi.mocked(putFile).mockResolvedValue(undefined);
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));
    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('file-edit-toggle'));
    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), { target: { value: 'Edited brief.' } });
    fireEvent.click(screen.getByTestId('markdown-editor-save'));

    await waitFor(() => expect(putFile).toHaveBeenCalledWith('shared/client-brief.md', 'Edited brief.'));
  });
});
