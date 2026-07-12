#!/usr/bin/env python3
"""Run the eval matrix: tasks x arms x reps through the ICM runner.

For each cell: build a fresh workspace, run every stage in order, blind-approve
each gate (that IS Arm A's auto-approve), and harvest .runner/runs/*.json into
eval/results/runs.csv.

CONTAMINATION RULE (do not weaken): this script never reads, edits, or repairs
stage output files. It reads only control-plane state (.runner/state.json,
.runner/runs/*.json). A failed run is a data point, not a bug to route around.

Requires: OPENROUTER_API_KEY in the environment; `npm install` done in
platform/runner.

Usage:
  python3 run_matrix.py --tasks meridian-smoke --arms icm,monolithic --reps 1
  python3 run_matrix.py --tasks t1,t2 --arms icm --reps 3 --model openai/gpt-5.2
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from build_monolithic import build_arm_b
from build_workspace import REPO, build_arm_a, load_task

RUNNER_DIR = REPO / "platform" / "runner"
RESULTS = REPO / "eval" / "results"
RUNS_ROOT = REPO / "eval" / "runs"

CSV_COLUMNS = [
    "task", "arm", "rep", "stage", "run_id", "status", "model",
    "tokens_spent", "token_budget", "wall_seconds", "files_written",
    "tool_errors", "gate_action", "error_message", "workspace",
]

BUILDERS = {"icm": build_arm_a, "monolithic": build_arm_b}


def runner(ws: Path, *args: str, timeout: int) -> subprocess.CompletedProcess:
    cmd = ["npm", "run", "--silent", "runner", "--", *args, "--workspace", str(ws)]
    return subprocess.run(cmd, cwd=RUNNER_DIR, capture_output=True, text=True, timeout=timeout)


def discover_stages(ws: Path) -> list[str]:
    return sorted(d.name for d in (ws / "stages").iterdir() if d.is_dir() and d.name[:2].isdigit())


def stage_status(ws: Path, stage: str) -> str:
    state_file = ws / ".runner" / "state.json"
    if not state_file.exists():
        return "missing"
    state = json.loads(state_file.read_text())
    return state.get("stages", {}).get(stage, {}).get("status", "missing")


def wall_seconds(log: dict) -> float:
    try:
        start = datetime.fromisoformat(log["startedAt"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(log["endedAt"].replace("Z", "+00:00"))
        return round((end - start).total_seconds(), 1)
    except (KeyError, ValueError):
        return -1.0


def latest_log(ws: Path, stage: str) -> dict:
    runs_dir = ws / ".runner" / "runs"
    if not runs_dir.exists():
        return {}
    logs = [json.loads(f.read_text()) for f in runs_dir.glob("*.json")]
    logs = [l for l in logs if l.get("stage") == stage]
    logs.sort(key=lambda l: l.get("endedAt", ""))
    return logs[-1] if logs else {}


def run_cell(task: dict, arm: str, rep: int, model: str | None, timeout: int) -> list[dict]:
    ws = RUNS_ROOT / f"{task['id']}__{arm}__r{rep}"
    BUILDERS[arm](task, ws, model)
    rows: list[dict] = []
    for stage in discover_stages(ws):
        gate_action, err = "", ""
        try:
            proc = runner(ws, "run", stage, timeout=timeout)
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout).strip()[-300:]
        except subprocess.TimeoutExpired:
            err = f"orchestrator timeout after {timeout}s"
        log = latest_log(ws, stage)
        status = log.get("status", "no_run_log")
        if status == "completed" and stage_status(ws, stage) == "awaiting_review":
            approve = runner(ws, "approve", stage, timeout=120)
            gate_action = "auto_approved" if approve.returncode == 0 else "approve_failed"
        rows.append({
            "task": task["id"], "arm": arm, "rep": rep, "stage": stage,
            "run_id": log.get("runId", ""), "status": status,
            "model": log.get("model", ""),
            "tokens_spent": log.get("tokensSpent", ""),
            "token_budget": log.get("tokenBudget", ""),
            "wall_seconds": wall_seconds(log) if log else "",
            "files_written": len(log.get("filesWritten", [])),
            "tool_errors": sum(1 for t in log.get("toolCalls", []) if t.get("result") == "error"),
            "gate_action": gate_action,
            "error_message": (log.get("errorMessage") or err or "")[:300],
            "workspace": str(ws.relative_to(REPO)),
        })
        if gate_action != "auto_approved":
            break  # pipeline blocked; remaining stages can't run — that's the data point
    return rows


def append_rows(rows: list[dict]) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    out = RESULTS / "runs.csv"
    new_file = not out.exists()
    with out.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if new_file:
            writer.writeheader()
        writer.writerows(rows)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", required=True, help="comma-separated task ids under eval/tasks/")
    parser.add_argument("--arms", default="icm,monolithic")
    parser.add_argument("--reps", type=int, default=1)
    parser.add_argument("--model", default=None, help="override model for all cells")
    parser.add_argument("--timeout", type=int, default=2400, help="seconds per stage run")
    args = parser.parse_args()

    if not os.environ.get("OPENROUTER_API_KEY"):
        sys.exit("OPENROUTER_API_KEY is not set")
    arms = [a.strip() for a in args.arms.split(",")]
    unknown = [a for a in arms if a not in BUILDERS]
    if unknown:
        sys.exit(f"unknown arm(s): {unknown}; valid: {list(BUILDERS)}")

    all_rows: list[dict] = []
    for task_id in args.tasks.split(","):
        task = load_task(task_id.strip())
        for arm in arms:
            for rep in range(1, args.reps + 1):
                print(f"=== {task['id']} / {arm} / rep {rep} ===", flush=True)
                rows = run_cell(task, arm, rep, args.model, args.timeout)
                for r in rows:
                    print(f"  {r['stage']}: {r['status']} "
                          f"({r['tokens_spent']} tok, {r['wall_seconds']}s) {r['error_message']}", flush=True)
                all_rows.extend(rows)

    out = append_rows(all_rows)
    completed = sum(1 for r in all_rows if r["status"] == "completed")
    print(f"\n{completed}/{len(all_rows)} stage runs completed. Results appended to {out}")


if __name__ == "__main__":
    main()
