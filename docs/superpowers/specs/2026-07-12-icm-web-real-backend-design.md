# ICM Web — Real Backend — Design

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

Companion to `docs/mvp-spec.md`, `docs/superpowers/specs/2026-07-12-runtime-storage-core-design.md`,
and `docs/superpowers/specs/2026-07-12-web-ui-design.md`. Those two prior sub-projects
built `platform/runner/` (the CLI that executes stages) and `platform/web/` (the
frontend SPA plus a mock server standing in for the real backend). This doc covers the
piece both of them explicitly deferred: **the thin Node service that lets the frontend
drive the real runner CLI**, so a user can open the web UI and watch a real stage run
end to end.

## Why this is its own sub-project

`docs/superpowers/specs/2026-07-12-web-ui-design.md`'s scope section is explicit: "The
real web backend ... is out of scope for this sub-project. This sub-project's mock
server stands in for it during frontend development; wiring the frontend to the real
backend is a future sub-project once the runner is further along." The runner
(`platform/runner/`) and the web UI (`platform/web/`) have both since landed on `main`.
This is that future sub-project.

## Scope

**In scope:**
- A new package, `platform/web/server/`, implementing every path in
  `contracts/openapi.yaml` against a **real** workspace: reads come from the
  workspace's `.runner/` files and git, exactly like the mock server already does;
  writes for `run`/`approve`/`reject` shell out to the real `platform/runner` CLI
  instead of simulating its effect.
- A seed routine that assembles a runnable test workspace by merging this repo's
  actual stage contracts (`stages/*/CONTEXT.md`, `references/`, `_config/conventions.md`)
  with `examples/meridian-support-automation`'s configured engagement data
  (`_config/voice.md`, `shared/*`, and stage `output/` for `01_research`/`02_analysis`
  only, leaving `03_report` pending) — because the `examples/` snapshot ships finished
  output but not the contracts that produced it.
- Manually verifying the full loop once: frontend + real server, load the pipeline,
  run `03_report` for real (actual OpenRouter call against the key in
  `platform/runner/.env`), watch it complete, view the run log.

**Explicitly out of scope:**
- Any change to `contracts/`. Frozen; if something doesn't fit, stop and ask.
- Any change to `platform/runner/` or `platform/web/frontend/` source. The frontend
  needs no changes (see Architecture — same port the mock server used). If the runner
  CLI's behavior doesn't fit what the backend needs (see the approve/reject guard
  below), the backend compensates; it does not patch the runner.
- Auth. Still "none in MVP mocks" per the OpenAPI spec — no endpoint shapes change.
- Docker packaging / docker-compose wiring (`docs/mvp-spec.md`'s deploy story). This is
  a dev-mode, run-locally backend for testing the integration, not the deploy artifact.
- Making `platform/web/mock-server/` route through the real runner. It stays exactly
  what it is: a fast, LLM-free stand-in for frontend dev and CI.

**Location:** `platform/web/server/`, a third package alongside `frontend/` and
`mock-server/`.

## Architecture

```
platform/web/server/
├── package.json         Node + Express + TS, same shape as mock-server's
├── src/
│   ├── server.ts         entrypoint — listens on :4000
│   ├── app.ts             wires the route modules together
│   ├── state.ts           reads .runner/state.json, .runner.lock, .runner/runs/*.json
│   │                      (ported from mock-server/src/state.ts — same file formats)
│   ├── pipeline.ts        builds the Pipeline view (ported from mock-server/src/pipeline.ts)
│   ├── git.ts             tree/diff/log/commit (ported from mock-server/src/git.ts)
│   ├── runnerCli.ts        NEW — shells out to platform/runner's CLI
│   ├── workspace.ts        NEW — seeds the merged test workspace (see Scope)
│   └── routes/
│       ├── pipeline.ts     ported as-is
│       ├── runs.ts         ported as-is
│       ├── files.ts        ported as-is
│       ├── treeDiffLog.ts  ported as-is
│       └── stageActions.ts NEW logic, same route shapes as the mock server's
```

"Ported" means copied from `platform/web/mock-server/src/` and adapted only where the
mock server's scratch-workspace-reset concept doesn't apply — not reimplemented from
scratch. These modules already read real `.runner/` files against the real schemas;
nothing about them is mock-specific.

The frontend's `vite.config.ts` proxies `/api` to `http://localhost:4000` — the port
`platform/web/mock-server` already uses. Running `platform/web/server` on the same
port during manual testing means **zero frontend changes**: don't run the mock server
and the real server at the same time.

### Data flow

**Reads** (`GET /api/pipeline`, `/api/runs/:id`, `/api/files`, `/api/tree`,
`/api/diff`, `/api/log`): identical to the mock server today — read `.runner/state.json`
/ `.runner.lock` / `.runner/runs/<id>.json` and shell out to `git`. No simulation
involved on this path even in the mock server, so no behavior changes.

**Writes:**
- `POST /api/stages/:stage/run` — the route pre-checks the lock (`.runner.lock` →
  409 if held) and stage ordering (walk lower-numbered stages' stored status → 422 if
  any isn't `approved`), matching what `checkStageOrder`/`acquireLock` already enforce
  inside the runner CLI. If both checks pass, it spawns
  `tsx platform/runner/src/cli.ts run <stage> --workspace <dir>` in the background
  (not awaited) with `OPENROUTER_API_KEY` injected from `platform/runner/.env`, and
  responds `202` immediately. The frontend polls `/api/pipeline`; `running` flips true
  the instant the CLI's own `acquireLock` writes `.runner.lock`, and flips false when
  the CLI's `finally` block releases it — no coordination needed beyond reading the
  same file both processes already agree on.
- `POST /api/stages/:stage/approve` / `/reject` — **the route must pre-check
  `status === 'awaiting_review'` (409 otherwise) before invoking the CLI.** I confirmed
  by reading `platform/runner/src/commands/approve.ts` and `reject.ts` that the CLI
  commands themselves don't guard current status — they'll happily "approve" a
  `pending` stage if called directly. The contract's 409 semantics are enforced by the
  backend, the same way the mock server's `routes/stageActions.ts` already does it.
  Once the pre-check passes, the backend calls `runner approve <stage>` /
  `runner reject <stage> --comment "..."` synchronously (these are fast, no model
  call) via `execFile`, and translates a non-zero exit to a 5xx.
- `PUT /api/files` — unchanged from the mock server: writes the file, commits as
  "human edit". No runner CLI involvement (writing workspace files isn't a runner
  concern).

### Seed workspace

The runner's agent loop instructs the model to read `CLAUDE.md`, then `CONTEXT.md`,
then the stage's own `CONTEXT.md` — real files that must exist in the workspace root.
`examples/meridian-support-automation` doesn't include them (its README explains why:
contracts are the same across engagements and live only at the repo root). The seed
routine builds `<scratch>/` by copying, in order:

1. This repo's `stages/` (contracts + `references/`) and `_config/conventions.md`.
2. `examples/meridian-support-automation`'s `_config/voice.md`, `shared/*`, and
   `stages/{01_research,02_analysis}/output/*` (overwriting nothing from step 1,
   layering into the same tree).
3. A workspace `CLAUDE.md` containing only this repo's Layer-0 "Workspace Identity"
   section — **not** the "Worktree identity: web UI sub-project" override that's
   specific to this dev repo's git history. Copying that override verbatim would tell
   the agent it isn't supposed to do ICM work at all.
4. `.runner/state.json` marking `01_research`/`02_analysis` `approved`,
   `03_report` absent (pending, per the state machine's "absent = pending" rule).

Then `git init` + commit, matching the mock server's `seedWorkspace` pattern. Default
scratch location: a tmp dir (e.g. `os.tmpdir()/icm-web-live-workspace`), overridable via
a `WORKSPACE_ROOT` env var.

## Error handling

Same status-code contract as the mock server (400/403/404/409/422 cases already
covered by its route tests) plus one new failure mode: if `OPENROUTER_API_KEY` is
missing when `run` is invoked, the runner CLI exits non-zero immediately. Since `run`
responds `202` before the CLI finishes, that failure isn't visible in the HTTP
response — it surfaces the same way any other run failure does, via the stage staying
`pending` and no `lastRunId` being set. Worth surfacing in manual testing, not worth
adding new API surface for.

## Testing

- Unit/route tests mirroring the mock server's existing coverage for the ported
  modules (they're portable almost verbatim, so tests port too), plus new tests for
  `runnerCli.ts`'s pre-checks (lock/stage-order/status guards) using a stub instead of
  really spawning the CLI.
- One manual end-to-end pass (not automated, this is a dev-mode integration check):
  start `platform/web/server`, start `platform/web/frontend`, confirm the pipeline
  view shows `01`/`02` approved and `03` pending, click Run on `03_report`, watch it
  go `running` → `awaiting_review` (or `pending` + error, if something's wrong),
  inspect the run log's gate summary, approve it.

**Cost note:** the manual pass makes a real OpenRouter call using the key in
`platform/runner/.env` — real token spend, not a mock. Confirmed acceptable with the
user before building this.
