import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceSidebar, type WorkspaceSidebarHandle } from './WorkspaceSidebar.js';
import type { StageView, TreeEntry } from '../api/client.js';

const STAGES: StageView[] = [
  { name: '01_research', status: 'approved', running: false },
  { name: '02_analysis', status: 'approved', running: false },
  { name: '03_report', status: 'pending', running: false },
];

const ENTRIES: TreeEntry[] = [
  { path: 'CONTEXT.md', type: 'file' },
  { path: 'shared/client-brief.md', type: 'file' },
  { path: 'stages/01_research/output/findings.md', type: 'file' },
  { path: 'stages/01_research/CONTEXT.md', type: 'file' },
  { path: 'stages/03_report/output/.gitkeep', type: 'file' },
];

describe('WorkspaceSidebar', () => {
  it('expands the focus stage by default and keeps other stages collapsed', () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);

    // 03_report is pending and unblocked -> it's the focus stage, expanded by default.
    expect(screen.getByTestId('stage-group-toggle-03_report')).toHaveTextContent('▾');
    // 01_research is approved -> collapsed by default, its output file isn't rendered.
    expect(screen.getByTestId('stage-group-toggle-01_research')).toHaveTextContent('▸');
    expect(screen.queryByTestId('file-tree-entry-stages/01_research/output/findings.md')).not.toBeInTheDocument();
  });

  it('collapses the Workspace group by default', () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('file-tree-entry-CONTEXT.md')).not.toBeInTheDocument();
  });

  it('expands the Workspace group on toggle click', () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    expect(screen.getByTestId('file-tree-entry-CONTEXT.md')).toBeInTheDocument();
  });

  it('drops .gitkeep files entirely', () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('file-tree-entry-stages/03_report/output/.gitkeep')).not.toBeInTheDocument();
  });

  it('shows an empty-state line for a stage with no output files', () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    // 03_report is expanded by default (focus stage) and its only tree entry is a dropped .gitkeep.
    expect(screen.getByTestId('stage-group-empty-03_report')).toBeInTheDocument();
  });

  it("keeps a stage's CONTEXT.md/references behind a collapsed \"Stage files\" disclosure", () => {
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId('stage-group-toggle-01_research'));
    expect(screen.queryByTestId('file-tree-entry-stages/01_research/CONTEXT.md')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stage-group-secondary-toggle-01_research'));
    expect(screen.getByTestId('file-tree-entry-stages/01_research/CONTEXT.md')).toBeInTheDocument();
  });

  it('calls onSelect with the file path when a file entry is clicked', () => {
    const onSelect = vi.fn();
    render(<WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('stage-group-toggle-01_research'));
    fireEvent.click(screen.getByTestId('file-tree-entry-stages/01_research/output/findings.md'));
    expect(onSelect).toHaveBeenCalledWith('stages/01_research/output/findings.md');
  });

  it('persists a manual expand choice across a re-render with new treeEntries', () => {
    const { rerender } = render(
      <WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByTestId('stage-group-toggle-01_research'));
    expect(screen.getByTestId('file-tree-entry-stages/01_research/output/findings.md')).toBeInTheDocument();

    const updatedEntries: TreeEntry[] = [
      ...ENTRIES,
      { path: 'stages/01_research/output/new.md', type: 'file' },
    ];
    rerender(<WorkspaceSidebar treeEntries={updatedEntries} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId('file-tree-entry-stages/01_research/output/findings.md')).toBeInTheDocument();
    expect(screen.getByTestId('file-tree-entry-stages/01_research/output/new.md')).toBeInTheDocument();
  });

  it('exposes a focusStage handle that expands the given stage', () => {
    const ref = createRef<WorkspaceSidebarHandle>();
    render(<WorkspaceSidebar ref={ref} treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('file-tree-entry-stages/01_research/output/findings.md')).not.toBeInTheDocument();

    act(() => {
      ref.current?.focusStage('01_research');
    });

    expect(screen.getByTestId('file-tree-entry-stages/01_research/output/findings.md')).toBeInTheDocument();
  });

  it('highlights the selected file', () => {
    render(
      <WorkspaceSidebar
        treeEntries={ENTRIES}
        stages={STAGES}
        selectedPath="stages/01_research/output/findings.md"
        onSelect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('stage-group-toggle-01_research'));
    expect(screen.getByTestId('file-tree-entry-stages/01_research/output/findings.md')).toHaveClass('font-semibold');
  });

  it('freezes the focus-stage default at mount, ignoring later changes to stages', () => {
    const { rerender } = render(
      <WorkspaceSidebar treeEntries={ENTRIES} stages={STAGES} selectedPath={null} onSelect={vi.fn()} />
    );
    // 03_report is the focus stage at mount (pending, unblocked) -> expanded by default.
    expect(screen.getByTestId('stage-group-toggle-03_report')).toHaveTextContent('▾');

    // Simulate a poll where 03_report becomes approved and 01_research becomes rejected
    // (the new "live" focus stage, if it were recomputed).
    const updatedStages: StageView[] = [
      { name: '01_research', status: 'rejected', running: false },
      { name: '02_analysis', status: 'approved', running: false },
      { name: '03_report', status: 'approved', running: false },
    ];
    rerender(
      <WorkspaceSidebar treeEntries={ENTRIES} stages={updatedStages} selectedPath={null} onSelect={vi.fn()} />
    );

    // Neither section was manually toggled, so both must keep their mount-time default,
    // not follow the new live focus stage (01_research).
    expect(screen.getByTestId('stage-group-toggle-03_report')).toHaveTextContent('▾');
    expect(screen.getByTestId('stage-group-toggle-01_research')).toHaveTextContent('▸');
  });
});
