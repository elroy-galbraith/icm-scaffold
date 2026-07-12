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

  it('sanitizes a malicious img onerror payload while still rendering safe content', () => {
    const { container, getByTestId } = render(
      <MarkdownViewer content={'Hello <img src=x onerror="window.__xss=true"> world'} />
    );
    const html = getByTestId('markdown-viewer').innerHTML;
    expect(html).not.toContain('onerror');
    expect(container.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).toContain('world');
  });

  it('sanitizes an embedded script tag', () => {
    const { getByTestId } = render(
      <MarkdownViewer content={'Body text.\n\n<script>window.__xss=true</script>'} />
    );
    const html = getByTestId('markdown-viewer').innerHTML;
    expect(html).not.toMatch(/<script/i);
  });

  it('still renders legitimate markdown structure (headings, bold, tables) after sanitization', () => {
    const content = [
      '# Title',
      '',
      'Some **bold** text.',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const { container } = render(<MarkdownViewer content={content} />);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('table')).not.toBeNull();
    const cells = Array.from(container.querySelectorAll('td')).map((td) => td.textContent);
    expect(cells).toEqual(['1', '2']);
  });
});
