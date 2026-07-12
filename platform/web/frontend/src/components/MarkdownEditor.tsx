import { useState } from 'react';

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
    <div data-testid="markdown-editor">
      <textarea
        data-testid="markdown-editor-textarea"
        aria-label={`Edit ${path}`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        type="button"
        data-testid="markdown-editor-save"
        disabled={!dirty || saving}
        onClick={() => onSave(content)}
      >
        Save
      </button>
    </div>
  );
}
