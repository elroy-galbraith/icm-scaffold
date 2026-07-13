import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { StageView, TreeEntry } from '../api/client.js';
import { groupTree } from '../lib/groupTree.js';
import { computeFocusStage } from '../lib/pipelineStatus.js';
import { Badge } from './ui/Badge.js';
import { STATUS_TONE } from './StageCard.js';

export interface WorkspaceSidebarProps {
  treeEntries: TreeEntry[];
  stages: StageView[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export interface WorkspaceSidebarHandle {
  focusStage: (stageName: string) => void;
}

function FileEntryButton({
  entry,
  selectedPath,
  onSelect,
}: {
  entry: TreeEntry;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={`file-tree-entry-${entry.path}`}
        onClick={() => onSelect(entry.path)}
        className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-white ${
          selectedPath === entry.path ? 'bg-white font-semibold text-ink' : 'text-muted'
        }`}
      >
        {entry.path}
      </button>
    </li>
  );
}

export const WorkspaceSidebar = forwardRef<WorkspaceSidebarHandle, WorkspaceSidebarProps>(function WorkspaceSidebar(
  { treeEntries, stages, selectedPath, onSelect },
  ref
) {
  const stageNames = stages.map((s) => s.name);
  const grouped = groupTree(treeEntries, stageNames);
  const focusStage = computeFocusStage(stages);

  const [manualExpand, setManualExpand] = useState<Record<string, boolean>>({});
  const [secondaryExpand, setSecondaryExpand] = useState<Record<string, boolean>>({});
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  useImperativeHandle(ref, () => ({
    focusStage: (stageName: string) => {
      setManualExpand((prev) => ({ ...prev, [stageName]: true }));
      sectionRefs.current.get(stageName)?.scrollIntoView({ block: 'nearest' });
    },
  }));

  const workspaceExpanded = manualExpand.workspace ?? false;

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-border px-4 py-4" data-testid="file-tree">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Files</h2>

      <div className="mb-3" data-testid="workspace-group">
        <button
          type="button"
          data-testid="workspace-group-toggle"
          onClick={() => setManualExpand((prev) => ({ ...prev, workspace: !workspaceExpanded }))}
          className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-semibold text-muted hover:bg-white"
        >
          <span>{workspaceExpanded ? '▾' : '▸'} Workspace</span>
          <span>{grouped.workspace.length}</span>
        </button>
        {workspaceExpanded && (
          <ul data-testid="workspace-group-content" className="mt-1 space-y-1">
            {grouped.workspace.map((entry) => (
              <FileEntryButton key={entry.path} entry={entry} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>

      {grouped.stages.map((group) => {
        const stage = stages.find((s) => s.name === group.stage)!;
        const expanded = manualExpand[group.stage] ?? group.stage === focusStage;
        const secondaryOpen = secondaryExpand[group.stage] ?? false;
        const totalFiles = group.primary.length + group.secondary.length;

        return (
          <div
            key={group.stage}
            data-testid={`stage-group-${group.stage}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(group.stage, el);
            }}
            className="mb-3"
          >
            <button
              type="button"
              data-testid={`stage-group-toggle-${group.stage}`}
              onClick={() => setManualExpand((prev) => ({ ...prev, [group.stage]: !expanded }))}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-white"
            >
              <span className="text-xs font-semibold text-ink">
                {expanded ? '▾' : '▸'} {group.stage}
              </span>
              <span className="flex items-center gap-2">
                {!expanded && <span className="text-[11px] text-muted">{totalFiles}</span>}
                <Badge tone={STATUS_TONE[stage.status]} data-testid={`stage-group-summary-${group.stage}`}>
                  {stage.status}
                </Badge>
              </span>
            </button>

            {expanded && (
              <div className="mt-1 pl-3">
                {group.primary.length === 0 ? (
                  <p data-testid={`stage-group-empty-${group.stage}`} className="px-2 py-1 text-xs text-muted">
                    No output files yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {group.primary.map((entry) => (
                      <FileEntryButton key={entry.path} entry={entry} selectedPath={selectedPath} onSelect={onSelect} />
                    ))}
                  </ul>
                )}

                {group.secondary.length > 0 && (
                  <div className="mt-1">
                    <button
                      type="button"
                      data-testid={`stage-group-secondary-toggle-${group.stage}`}
                      onClick={() => setSecondaryExpand((prev) => ({ ...prev, [group.stage]: !secondaryOpen }))}
                      className="text-[11px] font-semibold text-muted hover:text-ink"
                    >
                      {secondaryOpen ? '▾' : '▸'} Stage files
                    </button>
                    {secondaryOpen && (
                      <ul data-testid={`stage-group-secondary-content-${group.stage}`} className="mt-1 space-y-1">
                        {group.secondary.map((entry) => (
                          <FileEntryButton
                            key={entry.path}
                            entry={entry}
                            selectedPath={selectedPath}
                            onSelect={onSelect}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
});
