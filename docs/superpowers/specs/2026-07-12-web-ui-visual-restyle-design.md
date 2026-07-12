# Web UI — Visual Restyle Design

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

Companion to `docs/superpowers/specs/2026-07-12-web-ui-design.md` (the functional design
for `platform/web/frontend/`, already implemented). That doc specified behavior and data
flow; this doc covers the visual/layout treatment on top of it. No API, state-machine, or
component-contract changes — restyling only.

## Why this is its own pass

The frontend currently renders with zero styling — bare semantic HTML (`<section>`,
`<button>`, `<h2>`) with only browser defaults. It works but reads as a bare scaffold, not
a tool a reviewer wants to spend time in. This doc pins the visual direction (chosen via
mockup review — three style directions, two typography options, three layout options, and
a diff-line treatment were compared) before implementation.

## Scope

**In scope:**
- Add Tailwind CSS + shadcn/ui (Radix-based primitives) as the styling layer.
- Apply the chosen visual direction (tokens below) to all existing components:
  `PipelineView`, `StageCard`, `GateActions`, `MarkdownViewer`, `MarkdownEditor`,
  `DiffView`, `RunLogPanel`, and the toast list.
- Restructure the page shell from a single vertical stack into the layout described below
  (sidebar + stage rail + main content + slide-over run-log drawer).

**Explicitly out of scope:**
- Any change to API calls, TanStack Query usage, mutation logic, or component
  props/behavior beyond what's needed to fit the new shell (e.g. `RunLogPanel` moving into
  a `Sheet` still receives the same `runLog` prop).
- Swapping `MarkdownEditor`'s `<textarea>` for a real code editor (CodeMirror etc.) — still
  an open decision per the functional design doc, unrelated to this pass.
- Dark mode (deferred; token structure should make it additive later, not a rewrite).
- Any visual regression testing tooling — not present in this repo today; noted as a known
  gap, not solved here.
- Every `data-testid` attribute in every component stays exactly as-is. This pass only adds
  `className`s and reshuffles DOM containers around existing elements; it does not rename,
  remove, or add new interactive elements beyond what's listed below.

## Design tokens

- **Palette:** warm neutral scale (not the cool gray Tailwind default) — page background
  `#faf9f7`, card background `#ffffff`, borders `#e7e2da`, primary text `#1c1917`,
  secondary text `#8a8378`.
- **Status colors:** muted green (approved), muted amber (awaiting review), muted red
  (rejected / error), warm gray (pending). Used consistently for status badges and diff
  line backgrounds so the vocabulary of "green = good, amber = needs you, red = problem"
  is the same everywhere in the app.
- **Typography:** Georgia (system serif) for headings — h1/h2/h3, stage names — chosen
  over a self-hosted webfont to avoid any font loading cost or licensing; system
  sans-serif for all UI chrome (labels, buttons, body copy, metadata).
- **Shape:** 4px border radius, visible 1px borders rather than shadow-only elevation —
  reinforces a "reviewing a document" feel over a "floating dashboard card" feel.
- **Mode:** light only for this pass.

## Page layout

Persistent left sidebar renders the workspace file tree (from `/api/tree`). The main area
has a horizontal stage rail always visible at the top — every stage, its status badge, and
its available actions (Run / Approve / Reject) in one glance, no scrolling required to see
pipeline state. Below the rail, the selected file's viewer/editor and diff fill the rest of
the main area. `RunLogPanel` moves from an inline block into a right-hand slide-over
drawer (shadcn `Sheet`) triggered by "View last run," so opening a run log doesn't push the
rest of the page content around.

This was chosen over (a) a full-width stepper with a split file-tree/viewer pane below, and
(b) a tabbed Pipeline/Workspace split — both make reviewers choose between "what needs my
attention" and "what am I looking at," where the chosen layout keeps both visible at once.

## Component mapping

| Component | Treatment |
|---|---|
| `StageCard` | shadcn `Card` + `Badge` (status) + `Button` (Run/Approve/Reject), laid out horizontally in the stage rail |
| `GateActions` | `Button` (Approve) + `Textarea` + `Button` (Reject), grouped as an inline form on the card when status is `awaiting_review` |
| `MarkdownViewer` | styled prose container (max-width, warm-neutral text tokens) |
| `MarkdownEditor` | styled `Textarea`, unchanged behavior |
| `DiffView` | monospace block; each line kind (`added`/`removed`/`hunk`/`meta`/`context`) gets a muted full-row background in the matching status color — the "classic diff" treatment, chosen over a quieter left-accent-bar-only alternative for scannability |
| `RunLogPanel` | shadcn `Sheet` (slide-over drawer), content sections (metadata / files read / files written / tool calls) divided by `Separator` |
| Toast list | shadcn `Toast`-style stack, top-right corner, replacing the current plain `<div>` list |

## Testing

No test intent changes. Existing Vitest/Testing-Library component tests and Playwright
E2E specs assert on `data-testid` values and rendered text, both of which this pass
preserves exactly. Verification is a manual click-through of the dev server against the
mock server (per the functional design doc's own manual-verification step) — there's no
visual regression tooling in this repo to lean on instead.

## Decisions pinned by mockup review

- Visual direction: **Structured Editorial** (warm off-white, stronger borders, muted
  status colors) over a "Clean Minimal" (light/indigo-accent, shadcn-default) or "Dense
  Ops/Dark" (dark console) alternative.
- Typography: serif headings + sans UI, using the system Georgia font rather than a
  self-hosted webfont.
- Layout: sidebar + stage rail + slide-over run-log drawer, over a full-width-stepper or
  tabbed alternative.
- Diff line treatment: muted full-row backgrounds, over a left-accent-bar/text-only
  alternative.
- Dark mode: deferred, light-only for this pass.
