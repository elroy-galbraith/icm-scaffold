import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineView } from './PipelineView.js';
import { getPipeline, type Pipeline } from '../api/client.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getPipeline: vi.fn(), runStage: vi.fn(), approveStage: vi.fn(), rejectStage: vi.fn() };
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
});
