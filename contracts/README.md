# Contracts — shared interfaces between parallel worktrees

**Extend deliberately; don't break silently.** These files used to be frozen/read-only
while the web-UI and runner worktrees were developed independently. As of 2026-07-16 the
platform worktree (`worktree-icm-web`) actively extends this folder — see its CLAUDE.md.
The bar that survives: additive over breaking, one schema per concern, and a genuinely
breaking change (not just a new optional field) still means STOP and ask a human first.

## What's here

| File | Defines | Consumed by |
|---|---|---|
| `state-machine.md` | Stage statuses, transitions, derived `running` state, failure-join rule, stage-ordering policy, trigger sources | runner, web UI |
| `schemas/workspace-state.schema.json` | `.runner/state.json` | runner (writes), web (reads) |
| `schemas/run-log.schema.json` | `.runner/runs/<runId>.json` (incl. optional `trigger`: manual/schedule/channel) | runner (writes), web (reads) |
| `schemas/lock.schema.json` | `.runner.lock` | runner (writes), web (reads) |
| `schemas/runner-config.schema.json` | `<workspace>/runner.config.json` | runner (reads), web (reads), humans (write) |
| `schemas/schedule-config.schema.json` | `<workspace>/schedules.config.json` — cron-triggered stage runs | web server (reads/writes/ticks), humans (write) |
| `schemas/channel-config.schema.json` | `<workspace>/channels.config.json` — authenticated remote entry points | web server (reads/writes/authenticates), humans (write) |
| `openapi.yaml` | HTTP surface of the web backend | web backend (implements), web UI (mocks against) |

## Integration decision (pinned)

The web backend is a thin Node service in the same docker-compose:

- **Reads** workspace state directly from `.runner/state.json`, `.runner/runs/`,
  `.runner.lock`, and workspace files (same volume mount).
- **Writes** happen ONLY by shelling out to the runner CLI
  (`runner run|approve|reject --workspace <path>`) — the backend never mutates
  `.runner/` files itself. One writer, no drift.
- File edits by reviewers go through `PUT /api/files` (backend writes the file, then
  `git commit` via the same commit helper semantics as the runner: "human edit" commits).
- No HTTP layer inside the runner. The runner stays a CLI; the backend wraps it.

## Schedules & channels (pinned, 2026-07-16)

Both are new *trigger sources* for the exact same actions that already exist — neither
adds a new capability the runner or web backend doesn't already have:

- **A schedule only ever calls `run`.** It automates clicking "Run stage N"; it never
  automates clicking "Approve." Gates stay a human action, full stop — see
  `state-machine.md`. If a scheduled stage is locked or blocked by stage ordering, the
  scheduler skips that tick and tries again next time; it does not queue, force, or retry
  aggressively.
- **A channel is an authenticated adapter in front of run/status/approve/reject**, not a
  new action surface. `POST /api/channels/{id}/actions` dispatches to the same logic as
  `POST /api/stages/{stage}/run|approve|reject` and `GET /api/pipeline`. A channel can
  approve/reject (a human still performs the action, just from Slack/email/etc. instead
  of the web UI) — but only if `allowedActions` grants it, and every such action is
  attributed via the run log / commit trail like any other trigger.
- Every run's trigger (`manual` | `schedule` | `channel`, plus a `source` id) is recorded
  in the run log (`run-log.schema.json`) so "why did this run happen" is always
  answerable from the audit trail, not just "what happened."
- Channel tokens are never stored in `channels.config.json` — only the name of the env
  var holding them (`tokenEnvVar`). The file is git-tracked; the secret is not.

## Source of truth

Schemas were extracted from the runner plan
(`docs/superpowers/plans/2026-07-12-runtime-storage-core.md`, Tasks 3, 5, 6). If the
runner implementation and a schema here disagree, the schema wins; fix the runner.

## Required runner amendments (contract-driven, small)

Two gaps found during contract extraction — the runner worktree must pick these up:

1. **`stage` field in the lock file.** `LockInfo` lacks the stage being run, so a UI
   cannot tell *which* stage is running. Add `stage: string` to `LockInfo` and write it
   in `acquireLock`. Schema here already includes it.
2. **Stage-ordering enforcement.** `runner run <stage>` MUST refuse to run stage `NN_x`
   unless every lower-numbered stage is `approved` (exit with a clear error naming the
   blocking stage). A `--force` flag bypasses for development. Enforcement lives in the
   runner — single source of truth — not in the UI.
