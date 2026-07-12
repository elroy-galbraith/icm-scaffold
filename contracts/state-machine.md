# Run & Stage State Machine

## Stage status (stored in `.runner/state.json`)

```
                 runner run (status: completed)
   pending ────────────────────────────────▶ awaiting_review
      ▲                                        │         │
      │  runner run (status: error |           │ approve │ reject
      │  aborted_budget) → stays/returns       ▼         ▼
      │  to pending                        approved   rejected
      │                                                  │
      └──────────────── runner run (re-run) ◀────────────┘
```

Stored statuses: `pending | awaiting_review | approved | rejected`. Exactly these four —
`running` is NOT a stored status (see below).

## Transitions

| From | Event | To | Actor |
|---|---|---|---|
| `pending` (or absent) | `runner run` completes with run status `completed` | `awaiting_review` | runner |
| `pending` (or absent) | `runner run` ends with `error` or `aborted_budget` | `pending` | runner |
| `awaiting_review` | `runner approve` | `approved` | human (reviewer) |
| `awaiting_review` | `runner reject --comment` | `rejected` (comment stored) | human (reviewer) |
| `rejected` | `runner run` (re-run) | `awaiting_review` on success, `pending` on failure | runner |
| `approved` | `runner run` (re-run, allowed) | `awaiting_review` on success | runner |

Every transition is accompanied by a git commit in the workspace (run completion and
approval commit; rejection updates state only). Human file edits between transitions
are committed as "human edit" commits by the web backend.

## Run status (stored per run in `.runner/runs/<runId>.json`)

`completed | aborted_budget | error` — final states only. A run in progress has no
run-log file yet.

## Derived `running` state (the rule UIs must implement)

A stage is **running** iff `.runner.lock` exists AND `lock.stage == <stage>`.

- Lock present → show that stage as running (spinner), disable all `run` actions
  workspace-wide (one run at a time).
- Lock absent → no stage is running; stored statuses are authoritative.
- Stale lock (process dead): out of scope for MVP; surface lock age (`acquiredAt`) in
  the UI so a human can spot a stuck run and delete the lock manually.

## Failure-join rule (the second rule UIs must implement)

A failed run leaves the stage `pending` — failure details live ONLY in the run log.
To display "last run failed":

1. Read `state.stages[stage].lastRunId`.
2. Load `.runner/runs/<lastRunId>.json`.
3. If `status` is `error` or `aborted_budget`, render the failure (message, tokens
   spent vs budget) alongside the `pending` stage status.

## Stage-ordering policy (enforced by the runner)

`runner run NN_x` requires every stage with a lower numeric prefix to be `approved`.
Otherwise: exit non-zero with `Blocked: <stage> is <status>, must be approved first.`
`--force` bypasses (dev only; the web backend never passes `--force`).

Stage discovery: stages are the directories matching `stages/[0-9][0-9]_*` in the
workspace, ordered by numeric prefix. A stage absent from `state.json` is `pending`.
