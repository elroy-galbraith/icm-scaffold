import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownViewer } from './MarkdownViewer.js';

describe('MarkdownViewer', () => {
  it('renders markdown headings and paragraphs as HTML', () => {
    const { container } = render(<MarkdownViewer content={'# Title\n\nBody text.'} />);
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe('Title');
    expect(container.querySelector('p')?.textContent).toBe('Body text.');
  });

  it('renders an empty viewer for empty content without throwing', () => {
    const { getByTestId } = render(<MarkdownViewer content={''} />);
    expect(getByTestId('markdown-viewer')).toBeInTheDocument();
  });
});
