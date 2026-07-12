# Runtime & Storage Core — Design

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

Companion to `docs/mvp-spec.md`. This is sub-project 1 of the MVP platform build.

## Why this is its own sub-project

`docs/mvp-spec.md` describes a 4-6 week, multi-subsystem build: runtime/sandboxing,
storage sync, auth, a web UI, model gateway, guardrails, and (per this round of
brainstorming) Terraform for portable infra. That's too much for one design/plan/build
cycle. It decomposes into:

1. **Runtime & storage core** (this doc) — the runner that executes one ICM stage
   end-to-end. Foundation everything else depends on.
2. **Web UI** — workspace view, editor, gate approval flow. Depends on #1's interface.
3. **Auth** — operator/reviewer roles. Small; likely folds into #2.
4. **Model gateway** — multi-model config/pinning (this sub-project hardcodes one model).
5. **Guardrails** — outbound allowlist, injected system rules, full run logging.
6. **Terraform** — provisions the box(es) that run the eventual docker-compose stack, in
   a cloud-portable way (GCP now, migratable later). Deploy target for #1-5, not
   application code — designed once an app exists to deploy.

This doc covers #1 only.

## Scope

A CLI-driven runner that executes one ICM stage against a workspace folder — the
automated version of what a human currently does by hand with Claude Code, per this
repo's own `CLAUDE.md` / `CONTEXT.md` / stage `CONTEXT.md` contracts.

**In scope:**
- Agent tool-loop over OpenRouter, one hardcoded model.
- Filesystem jail to the workspace root.
- Git commit as audit trail (stage completion, and on approval to capture edits).
- One-run-at-a-time lock per workspace.
- Per-run token budget cap with clean abort.
- Structured run log (files read/written, tool calls, tokens, status).
- CLI: `runner run <stage>`, `runner status`, `runner approve`, `runner reject --comment`.

**Explicitly out of scope (deferred to later sub-projects):**
- MinIO/S3 sync — local volume + git only for now.
- Multi-model config/pinning (§5 of mvp-spec) — one hardcoded model.
- Outbound network allowlist and other guardrails (§6 of mvp-spec).
- Web UI, auth, Terraform.

**Location:** `platform/runner/` in this repo (TypeScript/Node), alongside the existing
`stages/`, `_config/`, etc. The runner treats the rest of this repo (or
`examples/meridian-support-automation`) as a workspace to operate on. Not split into a
separate repo for now.

## Architecture

```
CLI (runner run/status/approve/reject)
        │
        ▼
Agent loop (OpenRouter chat + tool calling, one hardcoded model)
   tools: read_file · write_file · list_dir · finish_stage
        │  every call is jailed to workspace root + logged
        ▼
Workspace folder (local volume)
   git commit on stage completion / on approve
        │
        ▼
Run log (JSON) + .runner/state.json (pipeline status) + .runner.lock
```

## Components

- **CLI** — the only interface for this sub-project. `run` triggers a stage; `status`
  reads `.runner/state.json` and the latest run log to report pending/running/
  awaiting-review/approved; `approve`/`reject` update state and (for approve) commit.
- **Agent loop** — minimal OpenRouter chat-completion loop with tool calling. Tools:
  `read_file`, `write_file`, `list_dir`, `finish_stage` (model calls this to signal it's
  reached the review gate — a deterministic stop instead of parsing free text). The
  model is handed the workspace root and stage id and navigates `CLAUDE.md` →
  `CONTEXT.md` → stage `CONTEXT.md` → Inputs itself, the same as a human driving Claude
  Code today. The runner does not parse contracts; it logs every tool call the model
  makes.
- **FS jail** — tool implementations resolve every path against the workspace root and
  reject traversal/symlink escapes, in addition to the container mount being the outer
  jail (per mvp-spec §1: container mount is the jail, no Firecracker/E2B yet).
- **Lock file** (`.runner.lock`) — acquired at run start, released at run end/abort.
  Concurrent run attempts fail immediately, naming the existing lock holder.
- **Token budget** — tracked cumulatively across the loop; run aborts cleanly when the
  cap is hit, reporting spend.
- **Git integration** — commits the workspace on stage completion, and again on
  `approve` (to capture human edits made before approval). This plus
  `.runner/state.json` is what makes `runner status` meaningful without a web UI.
- **Run log** — one JSON file per run: stage, model, every file read/written, tool
  calls, tokens spent, timestamps, final status (`completed`, `aborted_budget`, `error`).
- **Dockerfile** — container mount as the jail boundary.

## Data flow

1. `runner run 01_research` → acquire lock.
2. Agent loop runs: model reads context via tools, writes `output/` files, calls
   `finish_stage` with a gate summary.
3. Runner commits the workspace to git.
4. Run log written; lock released.
5. CLI prints the gate summary and stops.
6. `runner approve` commits any human edits made since step 3 and marks the stage
   approved in `.runner/state.json`. `runner reject --comment "..."` records the
   rejection without advancing.

## Error handling

- **Budget exceeded** → clean abort mid-loop, partial run log (`status:
  aborted_budget`), spend printed, lock released.
- **Tool errors** (bad path, missing file) → returned to the model as a tool error so it
  can retry, capped at a few attempts — not a runner crash.
- **Path-jail violation** → tool call rejected and logged.
- **Uncaught exception** → lock always released (`finally`); run log gets `status:
  error`. Workspace may be left partially written — git diff shows exactly what
  happened, which is the audit trail doing its job.
- **Concurrent run** → immediate CLI error naming the existing lock holder; no retry
  loop, no queueing (mvp-spec explicitly defers concurrent runs to v2).

## Testing

- **Unit tests:** path-jail resolver (traversal, absolute paths, symlink escape), lock
  acquire/release semantics, token budget accounting, run-log serialization.
- **Integration test:** run a stage against a small fixture workspace (fake `CLAUDE.md`
  / `CONTEXT.md` / stage) with a mocked OpenRouter client (scripted tool-call
  responses) — assert files written, commit created, run log correct, lock released.
- **Manual smoke test (non-CI, real API key):** run against
  `examples/meridian-support-automation` end to end.

## Decisions to pin during planning

- **Verify handling:** this sub-project does not automate the stage's Verify checklist.
  The gate summary from `finish_stage` includes the stage's raw Verify section text so
  the human reviewer checks it manually. Automated Verify checking is out of scope here
  — it's judgment-heavy (e.g. "no silent resolution of contradictions") and belongs with
  the guardrails/quality sub-project, not the runtime core.
- **Model:** hardcode one strong agentic OpenRouter model (chosen at implementation
  time) as a constant, not an env var — multi-model config is explicitly sub-project 4.
- **Token budget:** a single hardcoded default (chosen at implementation time), not yet
  configurable per workspace — configurability follows once the model-gateway
  sub-project adds per-workspace config.
