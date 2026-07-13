export interface DiffViewProps {
  diff: string;
  path: string;
}

type LineKind = 'added' | 'removed' | 'hunk' | 'meta' | 'context';

const META_PREFIXES = [
  '+++',
  '---',
  'diff --git',
  'new file mode ',
  'deleted file mode ',
  'index ',
  'old mode ',
  'new mode ',
  'similarity index ',
  'rename from ',
  'rename to ',
];

const LINE_CLASSES: Record<LineKind, string> = {
  added: 'bg-status-approved-bg text-status-approved',
  removed: 'bg-status-rejected-bg text-status-rejected',
  hunk: 'bg-status-pending-bg text-muted font-semibold',
  meta: 'text-muted',
  context: 'text-ink',
};

function classifyLine(line: string): LineKind {
  if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

export function DiffView({ diff, path }: DiffViewProps) {
  if (diff.trim().length === 0) {
    return (
      <div data-testid="diff-view">
        <p data-testid="diff-empty" className="text-sm text-muted">
          No changes for {path}.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="diff-view" className="overflow-x-auto rounded border border-border bg-white font-mono text-xs">
      {diff.split('\n').map((line, index) => {
        const kind = classifyLine(line);
        return (
          <div
            key={index}
            data-testid={`diff-line-${kind}`}
            className={`diff-line diff-line-${kind} whitespace-pre px-3 py-0.5 ${LINE_CLASSES[kind]}`}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}
