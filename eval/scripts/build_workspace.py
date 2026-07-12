#!/usr/bin/env python3
"""Build an Arm A (ICM) eval workspace from the repo scaffold.

Copies the scaffold layers (CLAUDE.md, CONTEXT.md, _config/, shared/, stages/),
injects the task's client brief, writes runner.config.json, and git-inits the
workspace so the runner's audit commits work.

Contamination rule: builders run BEFORE any model call. After build, nothing
in this toolchain reads or edits stage outputs.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCAFFOLD_ITEMS = ["CLAUDE.md", "CONTEXT.md", "_config", "shared", "stages"]


def load_task(task_id: str) -> dict:
    task_dir = REPO / "eval" / "tasks" / task_id
    task = json.loads((task_dir / "task.json").read_text())
    task["_dir"] = task_dir
    task["brief_text"] = (task_dir / task.get("brief", "brief.md")).read_text()
    return task


def clear_outputs(ws: Path) -> None:
    for out in ws.glob("stages/*/output"):
        for item in out.iterdir():
            if item.name == ".gitkeep":
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()


def write_runner_config(ws: Path, task: dict, model: str | None, budget_multiplier: int = 1) -> None:
    config = {
        "model": model or task.get("model", "anthropic/claude-sonnet-5"),
        "tokenBudget": int(task.get("stage_token_budget", 200_000)) * budget_multiplier,
        "allowedDomains": task.get("allowed_domains", []),
    }
    (ws / "runner.config.json").write_text(json.dumps(config, indent=2) + "\n")


def git_init(ws: Path) -> None:
    def git(*args: str) -> None:
        subprocess.run(["git", *args], cwd=ws, check=True, capture_output=True)

    git("init", "-q")
    git("config", "user.name", "icm-eval")
    git("config", "user.email", "eval@localhost")
    (ws / ".gitignore").write_text(".runner/\n.runner.lock\n")
    git("add", "-A")
    git("commit", "-q", "-m", "eval: initial workspace")


def build_arm_a(task: dict, dest: Path, model: str | None = None) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for item in SCAFFOLD_ITEMS:
        src = REPO / item
        if src.is_dir():
            shutil.copytree(src, dest / item)
        else:
            shutil.copy2(src, dest / item)
    clear_outputs(dest)
    (dest / "shared" / "client-brief.md").write_text(task["brief_text"])
    write_runner_config(dest, task, model, budget_multiplier=1)
    git_init(dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task_id", help="folder name under eval/tasks/")
    parser.add_argument("dest", type=Path, help="workspace directory to create")
    parser.add_argument("--model", default=None, help="override model slug (must be in VETTED_MODELS)")
    args = parser.parse_args()
    ws = build_arm_a(load_task(args.task_id), args.dest, args.model)
    print(f"Arm A workspace ready: {ws}")


if __name__ == "__main__":
    main()
