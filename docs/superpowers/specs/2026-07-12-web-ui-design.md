# Web UI — Design

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

Companion to `docs/mvp-spec.md` and `docs/superpowers/specs/2026-07-12-runtime-storage-core-design.md`.
This is sub-project 2 of the MVP platform build (per that doc's decomposition):
"Web UI — workspace view, editor, gate approval flow. Depends on #1's interface."

## Why this is its own sub-project

The runtime-storage-core design doc decomposed the MVP build into six pieces so each
gets its own spec/plan/build cycle. This doc covers #2: the web UI described in
`docs/mvp-spec.md` §4. It depends on sub-project #1's **interface** — the schemas and
state machine frozen in `contracts/` — not on sub-project #1's code. `contracts/README.md`
is explicit that parallel worktrees share only `contracts/`, never each other's source,
which is what lets this sub-project proceed while the runner (`platform/runner/`, in
`.claude/worktrees/icm-runner`) is still mid-implementation.

## Scope

**In scope:**
- A frontend SPA implementing all five pieces of mvp-spec §4: workspace/pipeline view
  with stage status, markdown viewer/editor for any output/config file, run stage
  (operator) and approve/reject-with-comment (reviewer) actions, run log per stage,
  diff view against the previous git commit.
- A mock server implementing every path in `contracts/openapi.yaml`, backed by a
  mutable, git-initialized copy of `examples/meridian-support-automation` — stateful,
  not canned JSON — so run/approve/reject actually drive the pipeline through the
  state machine in `contracts/state-machine.md`.

**Explicitly out of scope (deferred to later sub-projects):**
- The real web backend — the thin Node service that reads workspace state directly and
  writes only by shelling out to the runner CLI (the integration decision pinned in
  `contracts/README.md`). This sub-project's mock server stands in for it during
  frontend development; wiring the frontend to the real backend is a future sub-project
  once the runner is further along.
- Auth (operator/reviewer roles, login). The OpenAPI spec is explicit: "Auth: none in
  MVP mocks." No endpoint shapes change when auth lands later.
- Any change to `contracts/`. Frozen and read-only for this sub-project; if an
  implementation choice here doesn't fit a contract, stop and ask — never edit it.

**Location:** `platform/web/` in this repo, in a new worktree (`worktree-icm-web` at
`.claude/worktrees/icm-web`), alongside `platform/runner/`. Two packages:
`platform/web/frontend/` and `platform/web/mock-server/`.

## Architecture

```
platform/web/
├── frontend/          React + Vite + TypeScript SPA
│   ├── src/
│   │   ├── api/          typed client for contracts/openapi.yaml
│   │   ├── pages/         PipelineView (the main screen)
│   │   ├── components/    StageCard, MarkdownViewer, MarkdownEditor, DiffView,
│   │   │                  RunLogPanel, GateActions
│   │   └── ...
│   └── e2e/              Playwright specs, run against mock-server
└── mock-server/       Node + Express + TypeScript
    ├── src/
    │   ├── workspace.ts    seeds + resets a mutable git-backed copy of
    │   │                   examples/meridian-support-automation
    │   ├── state.ts        reads/writes .runner/state.json, .runner.lock,
    │   │                   .runner/runs/<id>.json — reimplemented here (not imported
    │   │                   from platform/runner), validated against
    │   │                   contracts/schemas/*.json via ajv
    │   ├── simulate.ts     "runs" a stage: acquire lock, ~3s delay, copy that stage's
    │   │                   pre-baked Meridian output into place, write a run log,
    │   │                   release lock, git commit
    │   └── routes/         one file per contracts/openapi.yaml path
    └── test/
```

**Frontend: React + Vite + TypeScript.** Chosen over Next.js (no SSR/routing need for a
single-workspace internal tool — pure overhead) and Svelte (smaller ecosystem for
markdown editing / diffing / polling-based data fetching, and a stylistic break from the
TS/Node conventions already established by `platform/runner/`). Data fetching via
TanStack Query, polling `/api/pipeline` — the contract's derived `running` state (per
`state-machine.md`) is designed around polling, not push.

**Mock server: stateful and git-backed, not canned JSON.** The OpenAPI surface includes
`/api/tree`, `/api/diff`, `/api/log`, `/api/files` — these are naturally real
filesystem/git operations, not worth faking with fixtures. At startup the mock server
copies `examples/meridian-support-automation` into a scratch directory (git-initialized),
seeded so stage `03_report` starts `pending` even though the shipped example has all
three stages complete — giving the UI something to actually run. Run/approve/reject
really write `.runner/state.json` / `.runner.lock` / `.runner/runs/<id>.json` and commit
to git, validated against `contracts/schemas/`. "Running" a stage doesn't call a real
model — it sleeps briefly, then copies that stage's already-written Meridian output into
place: simulating the runner's *effect*, not regenerating content. A mock-only
`POST /api/_reset` (not part of the contract) restores the seed state for repeat demos.

## Components

- **PipelineView** — polls `/api/pipeline` (~2s interval) and renders a `StageCard` per
  stage returned, in the order the API returns them (already ordered by numeric prefix
  per the contract).
- **StageCard** — status badge (`pending | awaiting_review | approved | rejected`),
  running spinner driven by the card's own `running` field (derived server-side per
  `state-machine.md`'s rule — the frontend does not re-derive it), last-run failure
  banner when `lastRun.status` is `error`/`aborted_budget` (the failure-join rule,
  pre-joined by the backend into `lastRun`), and the action buttons: Run (operator),
  Approve / Reject-with-comment (reviewer). All run/approve buttons workspace-wide
  disable when `pipeline.locked` is true, per the one-run-at-a-time rule.
- **MarkdownViewer / MarkdownEditor** — rendered markdown (viewer) or CodeMirror
  (editor) for any file selected from the workspace tree (`/api/tree`). Save issues
  `PUT /api/files` and refetches.
- **DiffView** — unified diff from `/api/diff` (default `ref=HEAD~1`), syntax-highlighted,
  shown alongside the viewer/editor for the selected file.
- **RunLogPanel** — for a selected run, fetches `/api/runs/{runId}` and shows model,
  files read/written, tool calls, tokens spent vs. budget, gate summary.
- **Error surfacing** — API errors (`409` locked, `422` stage-ordering blocked, `403`
  jail violation) render as inline toasts naming the specific blocking stage/reason from
  the response body, not generic "request failed" messages — the contract's error
  responses carry that detail specifically so the UI can show it.

## Data flow

1. `PipelineView` mounts, starts polling `/api/pipeline`.
2. User clicks **Run** on a pending stage → `POST /api/stages/{stage}/run` → `202`.
   Mock server acquires the lock, next poll shows `locked: true`, that stage's
   `running: true`.
3. ~3s later the mock server writes the stage's output files (copied from the Meridian
   fixture), writes a run log, updates `state.json` to `awaiting_review`, commits,
   releases the lock. Next poll reflects all of it.
4. User opens an output file → viewer/editor + diff view populate from `/api/files` and
   `/api/diff`.
5. User clicks **Approve** or **Reject** (with comment) → `POST .../approve` or
   `.../reject` → state updates, next poll reflects it; a rejected stage can be
   re-run per the state machine.

## Error handling

- **Locked (`409`)** — Run/Approve/Reject buttons disabled workspace-wide whenever
  `pipeline.locked` is true; if a request still races into a `409` (double-click), show
  the toast naming the current lock holder from the response body.
- **Stage-ordering blocked (`422`)** — Run button on a blocked stage is disabled with a
  tooltip naming the blocking stage (computed client-side from the already-fetched
  pipeline, mirroring `state-machine.md`'s policy); a `422` from a race is shown the same
  way as `409`.
- **Jail violation (`403`) on file read/write** — surfaced as a toast; should not occur
  through normal UI navigation since the tree endpoint only returns in-jail paths.
- **Mock server restart** — in-memory workspace state is lost; `POST /api/_reset` (also
  called automatically on server start) re-seeds from the fixture so the UI never hits
  an undefined state.
- **Playwright E2E flakiness around the ~3s simulated run** — tests wait on the polled
  UI state (e.g. "stage shows awaiting_review"), never on a fixed sleep.

## Testing

- **Component tests (Vitest + Testing Library):** `StageCard` (status/running/failure
  rendering, button disabled states), `GateActions` (approve/reject-with-comment
  validation), `DiffView` and `RunLogPanel` (render given fixture API responses).
- **Mock-server unit tests:** `state.ts` read/write round-trips and schema validation
  against `contracts/schemas/`, `simulate.ts` lock acquire/release and stage-ordering
  enforcement (mirroring the runner's own contract obligations), route handlers for each
  documented response code (`200`/`202`/`403`/`404`/`409`/`422`).
- **E2E (Playwright), against the real mock server:** the golden path — load pipeline,
  run the pending stage, watch it go `running` → `awaiting_review`, open the diff, edit
  a file, approve it. One or two edge-case specs: reject-with-comment, blocked
  stage-ordering.
- **Manual verification:** run frontend + mock server together locally, click through
  all five mvp-spec §4 pieces once by hand before calling the sub-project done.

## Decisions to pin during planning

- **Exact diff-rendering / markdown-editor libraries** (e.g. `react-diff-view` vs. a
  thinner hand-rolled unified-diff renderer; CodeMirror vs. a simpler `<textarea>` with
  syntax highlighting) — pick at implementation time based on bundle size and how much
  the E2E tests need to interact with them.
- **Poll interval** (proposed ~2s) — tune once the simulated run duration and E2E test
  patience are both in hand.
- **Seed state** — this doc fixes stage `03_report` as the one reset to `pending` on
  seed/reset; confirm this still makes sense once the frontend actually renders the
  other two stages' approved state (e.g. whether reviewers want to see a rejected stage
  in the initial seed too, to exercise that path without waiting on a demo click).
