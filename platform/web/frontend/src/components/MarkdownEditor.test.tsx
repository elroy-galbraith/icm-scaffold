import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownEditor } from './MarkdownEditor.js';

describe('MarkdownEditor', () => {
  it('shows the initial content and disables Save until it changes', () => {
    render(<MarkdownEditor path="shared/client-brief.md" initialContent="Hello" onSave={vi.fn()} />);
    expect(screen.getByTestId('markdown-editor-textarea')).toHaveValue('Hello');
    expect(screen.getByTestId('markdown-editor-save')).toBeDisabled();
  });

  it('enables Save once the content changes and calls onSave with the new content', () => {
    const onSave = vi.fn();
    render(<MarkdownEditor path="shared/client-brief.md" initialContent="Hello" onSave={onSave} />);

    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), { target: { value: 'Hello, edited.' } });
    const saveButton = screen.getByTestId('markdown-editor-save');
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith('Hello, edited.');
  });

  it('disables Save while a save is in flight', () => {
    render(<MarkdownEditor path="shared/client-brief.md" initialContent="Hello" onSave={vi.fn()} saving />);
    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), { target: { value: 'Changed' } });
    expect(screen.getByTestId('markdown-editor-save')).toBeDisabled();
  });
});
