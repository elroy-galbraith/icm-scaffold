# Web UI Sidebar Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PipelineView`'s flat, alphabetically-sorted file sidebar with a stage-grouped, collapsible sidebar per `docs/superpowers/specs/2026-07-13-web-ui-sidebar-reorg-design.md`, so a reviewer sees deliverables grouped by the stage that produced them, with scaffolding/reference files tucked behind a disclosure and the actionable stage expanded by default.

**Architecture:** A pure grouping function (`groupTree`) buckets the flat `TreeEntry[]` from `/api/tree` into a `Workspace` group plus one group per pipeline stage (each split into `primary`/`output` files and `secondary`/scaffolding files), filtering out `.gitkeep` and `.runner/*` entirely. A new `WorkspaceSidebar` component renders these as collapsible sections, computing which stage should start expanded via a new `computeFocusStage` helper (extracted alongside the existing `computeBlockedBy` into a shared `pipelineStatus.ts`). `StageCard` gains an `onSelectStage` callback on its header so clicking a stage in the top rail scrolls to and expands that stage's sidebar section via an imperative handle.

**Tech Stack:** React + TypeScript + Vite (existing). No new dependencies. Vitest + Testing Library for component/unit tests, Playwright for the one affected E2E spec.

## Global Constraints

- No changes to `contracts/openapi.yaml`, `/api/tree`'s response shape, or any backend package (`platform/web/shared`, `platform/web/server`, `platform/web/mock-server`) — this is a frontend presentation change only.
- Every existing `data-testid` on a file entry (`file-tree-entry-<path>`) and on `StageCard`'s existing elements stays exactly as-is; only new `data-testid`s are added.
- No new npm dependencies. Reuse existing `Badge`, `cn()` helpers and the existing warm-neutral/status Tailwind tokens already in the codebase.
- Repo `engines` requires Node >=20. TypeScript is `strict`; relative imports use explicit `.js` extensions (existing convention — keep it in every new file).
- Every new source file gets its own colocated `*.test.ts`/`*.test.tsx` file following existing Vitest + Testing Library conventions (see `src/lib/cn.test.ts`, `src/components/StageCard.test.tsx`).
- Stage names for grouping always come from `/api/pipeline`'s `stages[].name` (already fetched by `PipelineView`), never parsed independently from tree paths.
- Focus-stage priority (from the design doc): first stage `awaiting_review` or `rejected` (in pipeline order) → else first unblocked `pending` stage → else the last stage in pipeline order.

---

## File Structure

**New files:**
- `platform/web/frontend/src/lib/pipelineStatus.ts` + `.test.ts` — `computeBlockedBy` (moved here from `PipelineView.tsx`) and new `computeFocusStage`.
- `platform/web/frontend/src/lib/groupTree.ts` + `.test.ts` — pure grouping/filtering function over `TreeEntry[]`.
- `platform/web/frontend/src/components/WorkspaceSidebar.tsx` + `.test.tsx` — the collapsible, stage-grouped sidebar.

**Modified files:**
- `platform/web/frontend/src/components/StageCard.tsx` — export `STATUS_TONE`, add optional `onSelectStage` prop wired to a clickable header.
- `platform/web/frontend/src/components/StageCard.test.tsx` — one new test for the header click.
- `platform/web/frontend/src/pages/PipelineView.tsx` — remove the local `computeBlockedBy` and the flat `<aside>` file list; wire in `WorkspaceSidebar` and the rail-to-sidebar link.
- `platform/web/frontend/src/pages/PipelineView.test.tsx` — update the file-sidebar tests for the new grouped structure (files that used to be reachable directly are now under the `Workspace` group and need it expanded first).
- `platform/web/frontend/e2e/golden-path.spec.ts` — expand the `Workspace` group before selecting `shared/client-brief.md`.

---

### Task 1: Extract `computeBlockedBy` and add `computeFocusStage`

**Files:**
- Create: `platform/web/frontend/src/lib/pipelineStatus.ts`
- Create: `platform/web/frontend/src/lib/pipelineStatus.test.ts`
- Modify: `platform/web/frontend/src/pages/PipelineView.tsx`

**Interfaces:**
- Produces: `computeBlockedBy(stages: StageView[], stageName: string): { stage: string; status: StageStatus } | null` and `computeFocusStage(stages: StageView[]): string | null`, both imported from `../lib/pipelineStatus.js`. `WorkspaceSidebar` (Task 3) and `PipelineView` both depend on these exact names and signatures.

- [ ] **Step 1: Write the failing tests**

Create `platform/web/frontend/src/lib/pipelineStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBlockedBy, computeFocusStage } from './pipelineStatus.js';
import type { StageView } from '../api/client.js';

function stage(overrides: Partial<StageView> & Pick<StageView, 'name' | 'status'>): StageView {
  return { running: false, ...overrides };
}

describe('computeBlockedBy', () => {
  it('returns null when every earlier stage is approved', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    expect(computeBlockedBy(stages, '02_analysis')).toBeNull();
  });

  it('returns the first unapproved earlier stage', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'rejected' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeBlockedBy(stages, '03_report')).toEqual({ stage: '02_analysis', status: 'rejected' });
  });
});

describe('computeFocusStage', () => {
  it('returns null for an empty stage list', () => {
    expect(computeFocusStage([])).toBeNull();
  });

  it('prioritizes an awaiting_review stage over a later pending one', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'awaiting_review' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('02_analysis');
  });

  it('treats a rejected stage with the same priority as awaiting_review', () => {
    const stages = [
      stage({ name: '01_research', status: 'rejected' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('01_research');
  });

  it('falls back to the first unblocked pending stage when nothing needs review', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'pending' }),
      stage({ name: '03_report', status: 'pending' }),
    ];
    expect(computeFocusStage(stages)).toBe('02_analysis');
  });

  it('skips a blocked pending stage in favor of a later one that is unblocked', () => {
    // Not a realistic pipeline shape (stages are normally ordered), but exercises the
    // "blocked" branch independently of ordering assumptions.
    const stages = [
      stage({ name: '01_research', status: 'rejected' }),
      stage({ name: '02_analysis', status: 'pending' }),
    ];
    // 01_research is rejected so it wins on priority 1 before priority 2 is even considered.
    expect(computeFocusStage(stages)).toBe('01_research');
  });

  it('falls back to the last stage when every stage is approved', () => {
    const stages = [
      stage({ name: '01_research', status: 'approved' }),
      stage({ name: '02_analysis', status: 'approved' }),
      stage({ name: '03_report', status: 'approved' }),
    ];
    expect(computeFocusStage(stages)).toBe('03_report');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/web/frontend && npm test -- src/lib/pipelineStatus.test.ts`
Expected: FAIL — `Cannot find module './pipelineStatus.js'`

- [ ] **Step 3: Implement `pipelineStatus.ts`**

Create `platform/web/frontend/src/lib/pipelineStatus.ts`:

```ts
import type { StageStatus, StageView } from '../api/client.js';

export interface BlockedBy {
  stage: string;
  status: StageStatus;
}

export function computeBlockedBy(stages: StageView[], stageName: string): BlockedBy | null {
  for (const s of stages) {
    if (s.name >= stageName) break;
    if (s.status !== 'approved') {
      return { stage: s.name, status: s.status };
    }
  }
  return null;
}

export function computeFocusStage(stages: StageView[]): string | null {
  if (stages.length === 0) return null;

  for (const s of stages) {
    if (s.status === 'awaiting_review' || s.status === 'rejected') {
      return s.name;
    }
  }

  for (const s of stages) {
    if (s.status === 'pending' && computeBlockedBy(stages, s.name) === null) {
      return s.name;
    }
  }

  return stages[stages.length - 1].name;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/web/frontend && npm test -- src/lib/pipelineStatus.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Remove the local `computeBlockedBy` from `PipelineView.tsx` and import the shared one**

In `platform/web/frontend/src/pages/PipelineView.tsx`, delete this local function entirely:

```ts
function computeBlockedBy(
  stages: Array<{ name: string; status: StageStatus }>,
  stageName: string
): { stage: string; status: StageStatus } | null {
  for (const s of stages) {
    if (s.name >= stageName) break;
    if (s.status !== 'approved') {
      return { stage: s.name, status: s.status };
    }
  }
  return null;
}
```

Add this import near the top of the file, alongside the existing `../api/client.js` import:

```ts
import { computeBlockedBy } from '../lib/pipelineStatus.js';
```

- [ ] **Step 6: Run the existing PipelineView tests to confirm nothing broke**

Run: `cd platform/web/frontend && npm test -- src/pages/PipelineView.test.tsx`
Expected: PASS (all existing tests, unchanged)

- [ ] **Step 7: Commit**

```bash
git add platform/web/frontend/src/lib/pipelineStatus.ts platform/web/frontend/src/lib/pipelineStatus.test.ts platform/web/frontend/src/pages/PipelineView.tsx
git commit -m "refactor(web): extract computeBlockedBy, add computeFocusStage"
```

---

### Task 2: `groupTree` — bucket the workspace tree by stage

**Files:**
- Create: `platform/web/frontend/src/lib/groupTree.ts`
- Create: `platform/web/frontend/src/lib/groupTree.test.ts`

**Interfaces:**
- Consumes: `TreeEntry` from `../api/client.js` (`{ path: string; type: 'file' | 'dir' }`).
- Produces: `groupTree(entries: TreeEntry[], stageNames: string[]): GroupedTree`, where
  ```ts
  export interface StageFileGroup {
    stage: string;
    primary: TreeEntry[];
    secondary: TreeEntry[];
  }
  export interface GroupedTree {
    workspace: TreeEntry[];
    stages: StageFileGroup[];
  }
  ```
  `result.stages` always has exactly one entry per name in `stageNames`, in the same order, even if empty. Consumed by `WorkspaceSidebar` (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `platform/web/frontend/src/lib/groupTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupTree } from './groupTree.js';
import type { TreeEntry } from '../api/client.js';

const STAGE_NAMES = ['01_research', '02_analysis', '03_report'];

describe('groupTree', () => {
  it("buckets stage output files into that stage's primary list", () => {
    const entries: TreeEntry[] = [
      { path: 'stages/01_research/output/findings.md', type: 'file' },
      { path: 'stages/01_research/output/sources.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const research = result.stages.find((g) => g.stage === '01_research')!;
    expect(research.primary.map((e) => e.path)).toEqual([
      'stages/01_research/output/findings.md',
      'stages/01_research/output/sources.md',
    ]);
    expect(research.secondary).toEqual([]);
  });

  it("buckets non-output stage files into that stage's secondary list", () => {
    const entries: TreeEntry[] = [
      { path: 'stages/02_analysis/CONTEXT.md', type: 'file' },
      { path: 'stages/02_analysis/references/analysis-framework.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const analysis = result.stages.find((g) => g.stage === '02_analysis')!;
    expect(analysis.secondary.map((e) => e.path)).toEqual([
      'stages/02_analysis/CONTEXT.md',
      'stages/02_analysis/references/analysis-framework.md',
    ]);
    expect(analysis.primary).toEqual([]);
  });

  it('buckets root-level and non-stage files into the workspace group', () => {
    const entries: TreeEntry[] = [
      { path: 'CONTEXT.md', type: 'file' },
      { path: '_config/voice.md', type: 'file' },
      { path: 'shared/client-brief.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace.map((e) => e.path)).toEqual([
      'CONTEXT.md',
      '_config/voice.md',
      'shared/client-brief.md',
    ]);
  });

  it('drops .gitkeep files and everything under .runner', () => {
    const entries: TreeEntry[] = [
      { path: 'stages/01_research/output/.gitkeep', type: 'file' },
      { path: '.gitkeep', type: 'file' },
      { path: '.runner/state.json', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace).toEqual([]);
    expect(result.stages.every((g) => g.primary.length === 0 && g.secondary.length === 0)).toBe(true);
  });

  it('drops directory entries, keeping only files', () => {
    const entries: TreeEntry[] = [
      { path: 'stages', type: 'dir' },
      { path: 'stages/01_research', type: 'dir' },
      { path: 'stages/01_research/output', type: 'dir' },
      { path: 'stages/01_research/output/findings.md', type: 'file' },
    ];
    const result = groupTree(entries, STAGE_NAMES);
    const research = result.stages.find((g) => g.stage === '01_research')!;
    expect(research.primary.map((e) => e.path)).toEqual(['stages/01_research/output/findings.md']);
  });

  it('returns a group for every stage name even when it has no files', () => {
    const result = groupTree([], STAGE_NAMES);
    expect(result.stages.map((g) => g.stage)).toEqual(STAGE_NAMES);
    expect(result.workspace).toEqual([]);
  });

  it('treats a path under an unrecognized "stages/" directory as a workspace file', () => {
    const entries: TreeEntry[] = [{ path: 'stages/99_unknown/output/x.md', type: 'file' }];
    const result = groupTree(entries, STAGE_NAMES);
    expect(result.workspace.map((e) => e.path)).toEqual(['stages/99_unknown/output/x.md']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/web/frontend && npm test -- src/lib/groupTree.test.ts`
Expected: FAIL — `Cannot find module './groupTree.js'`

- [ ] **Step 3: Implement `groupTree.ts`**

Create `platform/web/frontend/src/lib/groupTree.ts`:

```ts
import type { TreeEntry } from '../api/client.js';

export interface StageFileGroup {
  stage: string;
  primary: TreeEntry[];
  secondary: TreeEntry[];
}

export interface GroupedTree {
  workspace: TreeEntry[];
  stages: StageFileGroup[];
}

const STAGE_PATH = /^stages\/([^/]+)\/(.*)$/;

export function groupTree(entries: TreeEntry[], stageNames: string[]): GroupedTree {
  const stageNameSet = new Set(stageNames);
  const stageGroups = new Map<string, StageFileGroup>();
  for (const name of stageNames) {
    stageGroups.set(name, { stage: name, primary: [], secondary: [] });
  }

  const workspace: TreeEntry[] = [];

  for (const entry of entries) {
    if (entry.type !== 'file') continue;
    if (isNoise(entry.path)) continue;

    const match = STAGE_PATH.exec(entry.path);
    const stageName = match?.[1];
    if (!match || !stageName || !stageNameSet.has(stageName)) {
      workspace.push(entry);
      continue;
    }

    const group = stageGroups.get(stageName)!;
    if (match[2].startsWith('output/')) {
      group.primary.push(entry);
    } else {
      group.secondary.push(entry);
    }
  }

  return {
    workspace,
    stages: stageNames.map((name) => stageGroups.get(name)!),
  };
}

function isNoise(path: string): boolean {
  return path === '.gitkeep' || path.endsWith('/.gitkeep') || path === '.runner' || path.startsWith('.runner/');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/web/frontend && npm test -- src/lib/groupTree.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add platform/web/frontend/src/lib/groupTree.ts platform/web/frontend/src/lib/groupTree.test.ts
git commit -m "feat(web): add groupTree helper to bucket workspace files by stage"
```

---

### Task 3: `WorkspaceSidebar` component

**Files:**
- Create: `platform/web/frontend/src/components/WorkspaceSidebar.tsx`
- Create: `platform/web/frontend/src/components/WorkspaceSidebar.test.tsx`
- Modify: `platform/web/frontend/src/components/StageCard.tsx` (Step 1 only — export `STATUS_TONE`; the `onSelectStage` prop itself is added in Task 4)

**Interfaces:**
- Consumes: `groupTree` from `../lib/groupTree.js`, `computeFocusStage` from `../lib/pipelineStatus.js`, `Badge`/`STATUS_TONE` (`STATUS_TONE` exported by Task 4), `StageView`/`TreeEntry` from `../api/client.js`.
- Produces:
  ```ts
  export interface WorkspaceSidebarProps {
    treeEntries: TreeEntry[];
    stages: StageView[];
    selectedPath: string | null;
    onSelect: (path: string) => void;
  }
  export interface WorkspaceSidebarHandle {
    focusStage: (stageName: string) => void;
  }
  export const WorkspaceSidebar: React.ForwardRefExoticComponent<
    WorkspaceSidebarProps & React.RefAttributes<WorkspaceSidebarHandle>
  >;
  ```
  Consumed by `PipelineView` (Task 5) via a ref: `sidebarRef.current.focusStage(stageName)`.
- `data-testid`s: `file-tree` (outer container, preserved from the old sidebar), `workspace-group`, `workspace-group-toggle`, `workspace-group-content`, `stage-group-<stageName>`, `stage-group-toggle-<stageName>`, `stage-group-empty-<stageName>`, `stage-group-secondary-toggle-<stageName>`, `stage-group-secondary-content-<stageName>`, `stage-group-summary-<stageName>` (on the status `Badge`), and the preserved `file-tree-entry-<path>` on every file button.

Since `WorkspaceSidebar` depends on `STATUS_TONE` being exported from `StageCard.tsx`, do Task 4's export step first even though Task 4 is numbered after this one — the two are written in this order because `WorkspaceSidebar` is the larger, riskier piece to get right, but its first test run needs the export in place.

- [ ] **Step 1: Export `STATUS_TONE` from `StageCard.tsx`**

In `platform/web/frontend/src/components/StageCard.tsx`, change:

```ts
const STATUS_TONE: Record<StageStatus, 'approved' | 'review' | 'rejected' | 'pending'> = {
```

to:

```ts
export const STATUS_TONE: Record<StageStatus, 'approved' | 'review' | 'rejected' | 'pending'> = {
```

Run: `cd platform/web/frontend && npm test -- src/components/StageCard.test.tsx`
Expected: PASS (unchanged — this is a pure export addition)

- [ ] **Step 2: Write the failing tests**

Create `platform/web/frontend/src/components/WorkspaceSidebar.test.tsx`:

```tsx
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
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd platform/web/frontend && npm test -- src/components/WorkspaceSidebar.test.tsx`
Expected: FAIL — `Cannot find module './WorkspaceSidebar.js'`

- [ ] **Step 4: Implement `WorkspaceSidebar.tsx`**

Create `platform/web/frontend/src/components/WorkspaceSidebar.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd platform/web/frontend && npm test -- src/components/WorkspaceSidebar.test.tsx`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add platform/web/frontend/src/components/StageCard.tsx platform/web/frontend/src/components/WorkspaceSidebar.tsx platform/web/frontend/src/components/WorkspaceSidebar.test.tsx
git commit -m "feat(web): add stage-grouped, collapsible WorkspaceSidebar"
```

---

### Task 4: `StageCard` header click → `onSelectStage`

**Files:**
- Modify: `platform/web/frontend/src/components/StageCard.tsx`
- Modify: `platform/web/frontend/src/components/StageCard.test.tsx`

**Interfaces:**
- Produces: `StageCardProps` gains `onSelectStage?: (stage: string) => void`. Consumed by `PipelineView` (Task 5), which wires it to `sidebarRef.current?.focusStage(stage)`.

- [ ] **Step 1: Write the failing test**

In `platform/web/frontend/src/components/StageCard.test.tsx`, add this test at the end of the `describe('StageCard', ...)` block (before the closing `});`):

```tsx
  it('calls onSelectStage with the stage name when the header is clicked, without triggering Run', () => {
    const onSelectStage = vi.fn();
    const onRun = vi.fn();
    render(
      <StageCard
        stage={makeStage()}
        workspaceLocked={false}
        onRun={onRun}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSelectStage={onSelectStage}
      />
    );
    fireEvent.click(screen.getByTestId('stagecard-header-03_report'));
    expect(onSelectStage).toHaveBeenCalledWith('03_report');
    expect(onRun).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd platform/web/frontend && npm test -- src/components/StageCard.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="stagecard-header-03_report"]`

- [ ] **Step 3: Add the `onSelectStage` prop and clickable header**

In `platform/web/frontend/src/components/StageCard.tsx`, add to `StageCardProps`:

```ts
  onSelectStage?: (stage: string) => void;
```

Add `onSelectStage` to the destructured props in the function signature:

```ts
export function StageCard({
  stage,
  workspaceLocked,
  blockedBy,
  isRunPending = false,
  isApprovePending = false,
  isRejectPending = false,
  onRun,
  onApprove,
  onReject,
  onViewRun,
  onSelectStage,
}: StageCardProps) {
```

Replace the header row:

```tsx
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-base font-bold text-ink">{stage.name}</h2>
        <Badge tone={STATUS_TONE[stage.status]} data-testid={`stagecard-status-${stage.name}`}>
          {stage.status}
        </Badge>
      </div>
```

with:

```tsx
      <button
        type="button"
        data-testid={`stagecard-header-${stage.name}`}
        onClick={() => onSelectStage?.(stage.name)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="font-serif text-base font-bold text-ink">{stage.name}</h2>
        <Badge tone={STATUS_TONE[stage.status]} data-testid={`stagecard-status-${stage.name}`}>
          {stage.status}
        </Badge>
      </button>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/web/frontend && npm test -- src/components/StageCard.test.tsx`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add platform/web/frontend/src/components/StageCard.tsx platform/web/frontend/src/components/StageCard.test.tsx
git commit -m "feat(web): StageCard header click notifies onSelectStage"
```

---

### Task 5: Wire `WorkspaceSidebar` into `PipelineView`

**Files:**
- Modify: `platform/web/frontend/src/pages/PipelineView.tsx`
- Modify: `platform/web/frontend/src/pages/PipelineView.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceSidebar`, `WorkspaceSidebarHandle` from `../components/WorkspaceSidebar.js`.

- [ ] **Step 1: Update the existing sidebar-related tests to expand the Workspace group first**

These five tests in `platform/web/frontend/src/pages/PipelineView.test.tsx` select a file that is not under any `stages/<name>/` path (`shared/client-brief.md`, `a.md`, `b.md`), so under the new grouping it lives in the collapsed-by-default `Workspace` group. Each needs a click on `workspace-group-toggle` before the first file-entry click.

Replace:

```tsx
  it('lists files from the workspace tree in a sidebar', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([
      { path: 'shared', type: 'dir' },
      { path: 'shared/client-brief.md', type: 'file' },
      { path: 'stages', type: 'dir' },
    ]);
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    expect(screen.queryByTestId('file-tree-entry-shared')).not.toBeInTheDocument();
  });
```

with:

```tsx
  it('lists files from the workspace tree in a sidebar', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([
      { path: 'shared', type: 'dir' },
      { path: 'shared/client-brief.md', type: 'file' },
      { path: 'stages', type: 'dir' },
    ]);
    renderWithClient(<PipelineView />);
    await waitFor(() => expect(screen.getByTestId('workspace-group-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    expect(screen.queryByTestId('file-tree-entry-shared')).not.toBeInTheDocument();
  });
```

Replace:

```tsx
  it('shows the selected file content in MarkdownViewer', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: '# Client Brief' });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));

    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());
    expect(getFile).toHaveBeenCalledWith('shared/client-brief.md');
  });
```

with:

```tsx
  it('shows the selected file content in MarkdownViewer', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: '# Client Brief' });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('workspace-group-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));

    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());
    expect(getFile).toHaveBeenCalledWith('shared/client-brief.md');
  });
```

Replace:

```tsx
  it('switches to MarkdownEditor and saves via putFile', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: 'Original brief.' });
    vi.mocked(putFile).mockResolvedValue(undefined);
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));
    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());
```

with:

```tsx
  it('switches to MarkdownEditor and saves via putFile', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: 'Original brief.' });
    vi.mocked(putFile).mockResolvedValue(undefined);
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('workspace-group-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));
    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument());
```

Replace:

```tsx
    // Select file A, enter edit mode, edit it, and kick off a save that stays in flight.
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-a.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-a.md'));
```

with:

```tsx
    // Select file A, enter edit mode, edit it, and kick off a save that stays in flight.
    await waitFor(() => expect(screen.getByTestId('workspace-group-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-a.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-a.md'));
```

(`a.md` and `b.md` are both in the `Workspace` group; expanding it once is enough for both subsequent selections in that test.)

Replace:

```tsx
  it('shows the diff for the selected file next to the viewer', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: '# Client Brief' });
    vi.mocked(getDiff).mockResolvedValue({
      path: 'shared/client-brief.md',
      ref: 'HEAD~1',
      diff: '@@ -1 +1 @@\n-Old\n+New',
    });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));
```

with:

```tsx
  it('shows the diff for the selected file next to the viewer', async () => {
    vi.mocked(getPipeline).mockResolvedValue(BASE_PIPELINE);
    vi.mocked(getTree).mockResolvedValue([{ path: 'shared/client-brief.md', type: 'file' }]);
    vi.mocked(getFile).mockResolvedValue({ path: 'shared/client-brief.md', content: '# Client Brief' });
    vi.mocked(getDiff).mockResolvedValue({
      path: 'shared/client-brief.md',
      ref: 'HEAD~1',
      diff: '@@ -1 +1 @@\n-Old\n+New',
    });
    renderWithClient(<PipelineView />);

    await waitFor(() => expect(screen.getByTestId('workspace-group-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('workspace-group-toggle'));
    await waitFor(() => expect(screen.getByTestId('file-tree-entry-shared/client-brief.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('file-tree-entry-shared/client-brief.md'));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd platform/web/frontend && npm test -- src/pages/PipelineView.test.tsx`
Expected: FAIL — the five updated tests time out waiting for `file-tree-entry-*` (the old flat `<aside>` doesn't have a `workspace-group-toggle`, and the sidebar hasn't been wired to `WorkspaceSidebar` yet)

- [ ] **Step 3: Wire `WorkspaceSidebar` into `PipelineView.tsx`**

Add these imports near the top of `platform/web/frontend/src/pages/PipelineView.tsx`, alongside the existing component imports:

```ts
import { WorkspaceSidebar, type WorkspaceSidebarHandle } from '../components/WorkspaceSidebar.js';
```

Add a ref declaration alongside the existing `useState` declarations in `PipelineView`:

```ts
  const sidebarRef = useRef<WorkspaceSidebarHandle>(null);
```

Delete this line (no longer needed — `WorkspaceSidebar` does its own file-type filtering via `groupTree`):

```ts
  const files = (treeQuery.data ?? []).filter((entry) => entry.type === 'file');
```

Replace the entire `<aside>` block:

```tsx
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border px-4 py-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Files</h2>
          <ul data-testid="file-tree" className="space-y-1">
            {files.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  data-testid={`file-tree-entry-${entry.path}`}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setEditing(false);
                  }}
                  className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-white ${
                    selectedPath === entry.path ? 'bg-white font-semibold text-ink' : 'text-muted'
                  }`}
                >
                  {entry.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>
```

with:

```tsx
        <WorkspaceSidebar
          ref={sidebarRef}
          treeEntries={treeQuery.data ?? []}
          stages={data.stages}
          selectedPath={selectedPath}
          onSelect={(path) => {
            setSelectedPath(path);
            setEditing(false);
          }}
        />
```

In the `stage-list` render, add `onSelectStage` to the `StageCard`:

```tsx
              <StageCard
                key={stage.name}
                stage={stage}
                workspaceLocked={data.locked}
                blockedBy={computeBlockedBy(data.stages, stage.name)}
                isRunPending={pendingRuns.has(stage.name)}
                isApprovePending={pendingApprovals.has(stage.name)}
                isRejectPending={pendingRejections.has(stage.name)}
                onRun={handleRun}
                onApprove={handleApprove}
                onReject={handleReject}
                onViewRun={(runId) => setSelectedRunId(runId)}
                onSelectStage={(name) => sidebarRef.current?.focusStage(name)}
              />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd platform/web/frontend && npm test -- src/pages/PipelineView.test.tsx`
Expected: PASS (all tests, including the five updated ones)

- [ ] **Step 5: Run the full frontend test suite and typecheck**

Run:
```bash
cd platform/web/frontend
npm run typecheck
npm test
```
Expected: both PASS with no errors

- [ ] **Step 6: Commit**

```bash
git add platform/web/frontend/src/pages/PipelineView.tsx platform/web/frontend/src/pages/PipelineView.test.tsx
git commit -m "feat(web): wire WorkspaceSidebar into PipelineView, link stage rail to sidebar"
```

---

### Task 6: Update the golden-path E2E spec

**Files:**
- Modify: `platform/web/frontend/e2e/golden-path.spec.ts`

**Interfaces:** none (test-only change).

- [ ] **Step 1: Update the spec**

In `platform/web/frontend/e2e/golden-path.spec.ts`, replace:

```ts
  // Edit a different file and save it.
  await page.getByTestId('file-tree-entry-shared/client-brief.md').click();
```

with:

```ts
  // Edit a different file and save it. It's a workspace-level file, not a stage output,
  // so it lives in the collapsed-by-default Workspace group — expand that first.
  await page.getByTestId('workspace-group-toggle').click();
  await page.getByTestId('file-tree-entry-shared/client-brief.md').click();
```

Note: no change needed for the earlier `file-tree-entry-stages/03_report/output/report.md` click — `03_report` starts `pending` in the seeded workspace, making it the focus stage per `computeFocusStage`, so its section (and primary/output list) is already expanded on page load.

- [ ] **Step 2: Run the E2E spec**

This requires the mock server running. From the repo root:

```bash
cd platform/web/mock-server && npm run dev &
cd platform/web/frontend && npm run e2e -- golden-path.spec.ts
```

Expected: PASS. Stop the mock server afterward (`kill %1` or `fg` then Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add platform/web/frontend/e2e/golden-path.spec.ts
git commit -m "test(web): update golden-path E2E spec for the grouped sidebar"
```

---

### Task 7: Manual verification

**Files:** none — verification only.

- [ ] **Step 1: Run frontend and mock server together**

```bash
cd platform/web/mock-server && npm run dev &
cd platform/web/frontend && npm run dev
```

- [ ] **Step 2: Click through the checklist**

Open the printed local URL and confirm:
- The sidebar shows a collapsed `Workspace` section at the top and one section per stage below it.
- `03_report` (seeded `pending`) starts expanded; `01_research`/`02_analysis` (seeded `approved`) start collapsed to a one-line summary with a file count.
- Expanding `01_research` shows its output files directly, with a `Stage files` disclosure (collapsed) for `CONTEXT.md`/`references/*`; no `.gitkeep` or `.runner` entries appear anywhere.
- Clicking the `01_research` `StageCard`'s header in the top rail scrolls to and expands the `01_research` sidebar section.
- Running `03_report`, then approving it, keeps the sidebar's file lists in sync with each poll.
- Expanding `Workspace` shows `CONTEXT.md`, `_config/*`, `shared/*`.

- [ ] **Step 3: Stop both dev servers**

```bash
kill %1 %2 2>/dev/null || true
```

No commit for this task — it's verification only, not a code change.
