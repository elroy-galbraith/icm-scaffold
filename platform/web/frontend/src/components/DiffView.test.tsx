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

const NEW_FILE_DIFF = [
  'diff --git a/somefile.md b/somefile.md',
  'new file mode 100644',
  'index 0000000..aa39060',
  '--- /dev/null',
  '+++ b/somefile.md',
  '@@ -0,0 +1,2 @@',
  '+# Somefile',
  '+First line.',
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

  it('classifies new-file diff metadata lines as meta, not context', () => {
    render(<DiffView diff={NEW_FILE_DIFF} path="somefile.md" />);

    const metaLines = screen.getAllByTestId('diff-line-meta');
    const metaText = metaLines.map((el) => el.textContent);
    expect(metaText).toContain('new file mode 100644');
    expect(metaText).toContain('index 0000000..aa39060');
    expect(metaText).toContain('--- /dev/null');
    expect(metaText).toContain('+++ b/somefile.md');
    expect(metaText).toContain('diff --git a/somefile.md b/somefile.md');

    expect(screen.queryByTestId('diff-line-context')).toBeNull();

    const added = screen.getAllByTestId('diff-line-added');
    expect(added).toHaveLength(2);
    expect(added[0]).toHaveTextContent('# Somefile');
    expect(added[1]).toHaveTextContent('First line.');
  });
});
