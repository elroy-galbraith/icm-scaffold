import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffView } from './DiffView.js';

const SAMPLE_DIFF = [
  'diff --git a/report.md b/report.md',
  '--- a/report.md',
  '+++ b/report.md',
  '@@ -1,2 +1,2 @@',
  ' # Report',
  '-Old line.',
  '+New line.',
].join('\n');

describe('DiffView', () => {
  it('shows a "no changes" message for an empty diff', () => {
    render(<DiffView diff="" path="report.md" />);
    expect(screen.getByTestId('diff-empty')).toHaveTextContent('report.md');
  });

  it('renders added and removed lines with distinguishing test ids', () => {
    render(<DiffView diff={SAMPLE_DIFF} path="report.md" />);
    const added = screen.getAllByTestId('diff-line-added');
    const removed = screen.getAllByTestId('diff-line-removed');
    expect(added).toHaveLength(1);
    expect(added[0]).toHaveTextContent('New line.');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toHaveTextContent('Old line.');
  });

  it('renders the hunk header distinctly from context lines', () => {
    render(<DiffView diff={SAMPLE_DIFF} path="report.md" />);
    expect(screen.getAllByTestId('diff-line-hunk')).toHaveLength(1);
    expect(screen.getAllByTestId('diff-line-context').length).toBeGreaterThan(0);
  });
});
