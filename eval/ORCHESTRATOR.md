# Eval Orchestrator Instructions

You (Claude Code, or any coding agent) are the **orchestrator** for eval runs
defined in `docs/eval-design.md`. Your job is mechanical: invoke scripts, read
control-plane results, report. You are not a participant in the experiment.

## Hard rules — violating any of these invalidates the run

1. **Never read, edit, or "fix" files in `eval/runs/*/stages/*/output/`.**
   The moment you repair an output, you become a hidden second agent and the
   A-vs-B comparison is dead. Failed or bad outputs are data points.
2. **Only interact with workspaces through `eval/scripts/`** and the runner CLI
   commands those scripts issue. No manual `runner run`, no direct file writes
   into a built workspace.
3. **Never rerun a cell because the output "looks weak."** Rerun only for
   category-6 runner faults (crash, lock error, orchestrator timeout — see the
   failure taxonomy in eval-design.md §7), and log the rerun in
   `eval/results/rerun-log.md` with run id and reason.
4. **Do not change `docs/eval-design.md` §1 or §6** (hypotheses, thresholds)
   once scored runs exist. Additions only, dated.
5. If a script errors, report the error verbatim. Do not improvise a workaround
   that touches workspace internals.

## Preflight (once per session)

```bash
cd platform/runner && npm install && npx vitest run   # all tests must pass
echo $OPENROUTER_API_KEY | head -c 8                  # must be non-empty
```

## Running the smoke test

```bash
cd eval/scripts
python3 run_matrix.py --tasks meridian-smoke --arms icm,monolithic --reps 1
```

Success criteria (mechanics, not quality):

- Arm A: three stage rows, all `completed`, all `auto_approved`.
- Arm B: one stage row, `completed`, `auto_approved`.
- `eval/results/runs.csv` has the rows; each workspace under `eval/runs/`
  has git history (one commit per stage run) and `.runner/runs/*.json`.

Quality of the smoke-test outputs is explicitly NOT evaluated — the task uses
a fictional client and a token web allowlist. It exists to prove the pipe.

## Running a real matrix (after tasks are frozen)

```bash
python3 run_matrix.py --tasks <id1>,<id2>,... --arms icm,monolithic --reps 3
python3 run_matrix.py --tasks <ids> --arms icm,monolithic --reps 3 --model openai/gpt-5.2   # H6 grid
```

## Reporting

Report from `eval/results/runs.csv` only: completion counts, token/time totals
per arm, tool-error counts, and any pipeline blocks (rows where later stages are
missing). Scoring (citations, quality judging) is a separate phase with its own
scripts — do not eyeball outputs and offer quality opinions.

## Known gaps (do not work around silently)

- No `search_web` tool yet — DRBench tasks are blocked until it exists.
  `fetch_url` + per-task `allowed_domains` is the only web access.
- No seed/temperature control in runner config — reps vary only by sampling
  noise at default settings.
