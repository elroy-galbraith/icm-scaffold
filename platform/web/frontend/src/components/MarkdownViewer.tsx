import { marked } from 'marked';
import DOMPurify from 'dompurify';

export interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const rawHtml = marked.parse(content, { async: false }) as string;
  // marked does not sanitize its output; content originates from workspace files that may
  // have been LLM-generated or edited by a client, so untrusted markup (e.g. <script>,
  // onerror handlers) must be stripped before it reaches the DOM.
  const html = DOMPurify.sanitize(rawHtml);
  return <div data-testid="markdown-viewer" dangerouslySetInnerHTML={{ __html: html }} />;
}
