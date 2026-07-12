# Contracts — frozen interfaces between parallel worktrees

**These files are read-only for coding agents.** If your implementation doesn't fit a
contract, STOP and ask the human — never modify a contract to fit your code.

Reference this folder from every worktree's CLAUDE.md:
"Read `contracts/` first. Never modify it. If blocked by it, ask."

## What's here

| File | Defines | Consumed by |
|---|---|---|
| `state-machine.md` | Stage statuses, transitions, derived `running` state, failure-join rule, stage-ordering policy | runner, web UI |
| `schemas/workspace-state.schema.json` | `.runner/state.json` | runner (writes), web (reads) |
| `schemas/run-log.schema.json` | `.runner/runs/<runId>.json` | runner (writes), web (reads) |
| `schemas/lock.schema.json` | `.runner.lock` | runner (writes), web (reads) |
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
