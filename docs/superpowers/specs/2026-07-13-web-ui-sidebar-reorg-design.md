# Web UI — Sidebar Reorganization Design

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-13

Companion to `docs/superpowers/specs/2026-07-12-web-ui-design.md` (functional design) and
`docs/superpowers/specs/2026-07-12-web-ui-visual-restyle-design.md` (visual treatment,
already implemented). Both are unchanged by this pass — no API, state-machine, contract,
or design-token changes. This doc covers reorganizing the file sidebar's content and
behavior only.

## Why this is its own pass

`GET /api/tree` returns every file under the workspace root except `.git` and
`node_modules` — by contract (`contracts/openapi.yaml`: "includes `.runner`"), and
correctly so; the endpoint's job is to expose the whole workspace, not to guess what a
reviewer wants. For a real 3-stage workspace this is ~20 entries: root `CONTEXT.md`,
`CLAUDE.md`, `_config/{conventions,voice}.md`, `shared/{client-brief,glossary}.md`, and
per stage a `CONTEXT.md`, a `references/*.md`, `.gitkeep` placeholders, plus
`.runner/state.json` — alongside the actual deliverables (`findings.md`, `report.md`,
etc.). The sidebar today (`PipelineView.tsx`) renders this as one flat, alphabetically-
ordered list with no relationship to the stage rail above it. A reviewer has to scan past
scaffolding and placeholder files to find the outputs they're actually there to review,
and nothing in the sidebar indicates which stage produced which file or which stage needs
their attention right now. This pass fixes the sidebar's organization and default focus;
it does not touch how files are viewed/edited/diffed once selected.

## Scope

**In scope:**
- A pure grouping/filtering function over `TreeEntry[]` (from `/api/tree`) that buckets
  entries into a `Workspace` group and one group per pipeline stage, each split into
  primary (`output/`) and secondary (everything else under that stage) file lists.
- Replacing the sidebar's flat `<ul>` of file entries with collapsible per-stage (and one
  workspace) sections, each showing a status-aware default collapsed/expanded state.
- Linking the stage rail to the sidebar: clicking a `StageCard` header scrolls to and
  expands the matching sidebar section.

**Explicitly out of scope:**
- Any change to `/api/tree`'s response shape, `contracts/openapi.yaml`, or backend
  filtering — the endpoint keeps returning everything; all filtering is client-side
  presentation.
- Any change to `StageCard`'s status badges, Run/Approve/Reject buttons, or the stage
  rail's layout beyond adding a click handler to the header.
- Any change to `MarkdownViewer`, `MarkdownEditor`, `DiffView`, or `RunLogPanel` — file
  selection still drives the same viewer/editor/diff panel with the same props.
- A merged rail+sidebar navigation (considered, rejected: the stage rail already works as
  an at-a-glance status/action bar; merging is a bigger restructure for no added clarity
  once the sidebar itself is stage-grouped).
- New "what to do next" UI (banners, callouts) beyond the auto-expand default itself.

## Grouping rules

A pure function, e.g. `groupTree(entries: TreeEntry[], stageNames: string[])`, applied to
the flat array `/api/tree` returns:

- Drop entirely: any entry named `.gitkeep`, and any entry whose path starts with
  `.runner/`. These are never useful to open from this UI.
- An entry whose path matches `stages/<name>/output/...` (and `<name>` is a known stage)
  goes to that stage's **primary** list.
- An entry whose path matches `stages/<name>/...` but is *not* under `output/` (i.e.
  `CONTEXT.md`, `references/*`, `input/*`) goes to that stage's **secondary** list.
- Everything else — root `CONTEXT.md`, `CLAUDE.md`, `README.md`, `_config/*`, `shared/*`,
  and any future top-level file not under `stages/` — goes to a single **Workspace**
  group, itself treated as a secondary/collapsed list (same visual weight as a stage's
  secondary list; it's reference material, not a deliverable).

Stage names for grouping come from the already-fetched `/api/pipeline` response
(`data.stages[].name`), not by parsing directory names independently — the pipeline
endpoint is the single source of truth for what a "stage" is and its display order.

## Sidebar structure and default state

The sidebar becomes a vertical list of collapsible sections, in this order: `Workspace`,
then one section per stage in pipeline order.

- **Workspace** section: collapsed by default. Expanding it lists its files flat (no
  further sub-grouping needed at this scale).
- **Each stage** section: header shows the stage name and a compact status summary (reusing
  the same status vocabulary as `StageCard`'s badge) plus a file count when collapsed.
  - Default expand/collapse: the **focus stage** starts expanded; every other stage starts
    collapsed to its one-line summary. Focus stage is computed as, in priority order: the
    first stage (in pipeline order) with status `awaiting_review` or `rejected` — both need
    the user's eyes, either to approve/reject or to see the rejection comment and re-run;
    else the first `pending` stage that isn't blocked by an earlier unapproved stage; else
    (every stage `approved`) the last stage in pipeline order. This mirrors
    `computeBlockedBy`'s existing notion of "blocked," so the two never disagree about
    what's actionable.
  - When expanded, a stage section always shows its **primary** (`output/`) file list
    directly. Its **secondary** list (`CONTEXT.md`, `references/*`, `input/*`) sits behind
    its own "Stage files" disclosure, collapsed by default, nested inside the stage
    section.
- **Manual overrides persist:** once the user expands/collapses a stage section or a
  "Stage files" disclosure, that choice is retained across the 2s poll refetch — the
  recomputed focus-stage default only applies on initial mount, never overwriting a
  session's-worth of user interaction. State lives in local component state (a set of
  "manually toggled" keys), not persisted beyond the page session.
- **Stage rail → sidebar link:** clicking a `StageCard`'s header (not its action buttons)
  scrolls the sidebar to that stage's section and expands it if collapsed, overriding
  whatever the auto/manual state was — an explicit navigation action always wins.

Selecting a file (from any section, primary or secondary, workspace or stage) behaves
exactly as today: it sets `selectedPath`, which drives the existing viewer/editor/diff
pane. No change to that data flow.

## Components

- New: a grouping helper (e.g. `src/lib/groupTree.ts`) implementing the rules above —
  pure, unit-testable independent of rendering.
- New: a `WorkspaceSidebar` component (extracted from the inline `<aside>` block in
  `PipelineView.tsx`) that takes `treeEntries`, `stages`, `selectedPath`, `onSelect`, and
  renders the collapsible structure. Owns its own expand/collapse state.
- Modified: `StageCard` gains an `onSelectStage`/similar callback on its header for the
  scroll-and-expand link; no change to its existing props otherwise.
- Modified: `PipelineView` wires `WorkspaceSidebar` in place of the current flat file list,
  and passes a ref/scroll mechanism between the stage rail and the sidebar.

## Edge cases

- Empty workspace / no stages loaded yet: sidebar renders nothing but doesn't error (same
  loading/error states `PipelineView` already has for the whole page).
- A stage with an empty primary list (nothing in `output/` yet, e.g. a `pending` stage
  that's never run): its section still renders, primary list shows an empty-state line
  rather than nothing (so the user isn't left wondering if the section is broken).
- All stages `approved`: focus-stage defaults to the last stage, per the rule above, so the
  final deliverable is what's expanded on load.
- New files appearing on repeated polls (a running stage just finished): they slot into
  the existing group/section on the next poll without resetting the user's manual
  expand/collapse choices for unrelated sections.

## Testing

- Unit tests for `groupTree`: filtering (`.gitkeep`, `.runner/*` dropped), correct
  primary/secondary/workspace bucketing, stage-name matching against a provided stage
  list, unknown/malformed paths.
- Component tests for `WorkspaceSidebar`: default expand/collapse per focus-stage rule,
  manual toggle persists across a simulated re-render with new `treeEntries`, "Stage
  files" disclosure behavior, workspace section collapsed by default.
- Component test for `StageCard`: header click invokes the new callback without triggering
  Run/Approve/Reject.
- E2E (Playwright): update the existing golden-path spec's file-tree interactions to
  navigate through the new grouped structure (expand a stage, open a file) instead of a
  flat list; existing `data-testid`s on file entries themselves are preserved so viewer/
  diff assertions downstream of "file selected" don't need to change.
- Manual verification: click through a full pipeline (some stages approved, one awaiting
  review, one pending) against the mock server, confirm the right stage auto-expands and
  the rail-to-sidebar link works.
