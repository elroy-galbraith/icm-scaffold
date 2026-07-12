import { marked } from 'marked';

export interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const html = marked.parse(content, { async: false }) as string;
  return <div data-testid="markdown-viewer" dangerouslySetInnerHTML={{ __html: html }} />;
}
