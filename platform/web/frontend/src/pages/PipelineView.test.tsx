import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineView } from './PipelineView.js';
import { getPipeline, type Pipeline } from '../api/client.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getPipeline: vi.fn() };
});

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

  it('renders a row per stage once loaded', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stage-row-03_report')).toBeInTheDocument());
    expect(screen.getByTestId('stage-row-01_research')).toHaveTextContent('approved');
    expect(screen.getByTestId('stage-row-03_report')).toHaveTextContent('pending');
  });

  it('shows a workspace-locked banner when pipeline.locked is true', async () => {
    vi.mocked(getPipeline).mockResolvedValue({ ...BASE_PIPELINE, locked: true });
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('pipeline-locked')).toBeInTheDocument());
  });

  it('shows a running indicator for the stage whose running field is true', async () => {
    vi.mocked(getPipeline).mockResolvedValue({
      ...BASE_PIPELINE,
      locked: true,
      stages: BASE_PIPELINE.stages.map((s) => (s.name === '03_report' ? { ...s, running: true } : s)),
    });
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stage-running-03_report')).toBeInTheDocument());
    expect(screen.queryByTestId('stage-running-01_research')).not.toBeInTheDocument();
  });

  it('shows the failure reason for a pending stage whose last run errored', async () => {
    vi.mocked(getPipeline).mockResolvedValue({
      ...BASE_PIPELINE,
      stages: BASE_PIPELINE.stages.map((s) =>
        s.name === '03_report'
          ? {
              ...s,
              lastRun: {
                runId: 'run-9',
                status: 'error',
                endedAt: '2026-07-12T09:00:00.000Z',
                tokensSpent: 100,
                tokenBudget: 200000,
                errorMessage: 'Too many consecutive tool errors',
              },
            }
          : s
      ),
    });
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('stage-failure-03_report')).toBeInTheDocument());
    expect(screen.getByTestId('stage-failure-03_report')).toHaveTextContent('Too many consecutive tool errors');
  });

  it('shows an error state when the pipeline fetch rejects', async () => {
    vi.mocked(getPipeline).mockRejectedValue(new Error('network down'));
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('pipeline-error')).toBeInTheDocument());
  });
});
