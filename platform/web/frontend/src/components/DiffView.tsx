export interface DiffViewProps {
  diff: string;
  path: string;
}

type LineKind = 'added' | 'removed' | 'hunk' | 'meta' | 'context';

function classifyLine(line: string): LineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

export function DiffView({ diff, path }: DiffViewProps) {
  if (diff.trim().length === 0) {
    return (
      <div data-testid="diff-view">
        <p data-testid="diff-empty">No changes for {path}.</p>
      </div>
    );
  }

  return (
    <div data-testid="diff-view">
      {diff.split('\n').map((line, index) => {
        const kind = classifyLine(line);
        return (
          <div key={index} data-testid={`diff-line-${kind}`} className={`diff-line diff-line-${kind}`}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
