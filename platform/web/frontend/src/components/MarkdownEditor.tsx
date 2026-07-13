import { useState } from 'react';
import { Button } from './ui/Button.js';

export interface MarkdownEditorProps {
  path: string;
  initialContent: string;
  onSave: (content: string) => void;
  saving?: boolean;
}

export function MarkdownEditor({ path, initialContent, onSave, saving = false }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const dirty = content !== initialContent;

  return (
    <div data-testid="markdown-editor" className="flex flex-col gap-2">
      <textarea
        data-testid="markdown-editor-textarea"
        aria-label={`Edit ${path}`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[320px] w-full rounded border border-border bg-white p-3 font-mono text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink"
      />
      <Button
        type="button"
        variant="primary"
        data-testid="markdown-editor-save"
        disabled={!dirty || saving}
        onClick={() => onSave(content)}
        className="self-end"
      >
        Save
      </Button>
    </div>
  );
}
