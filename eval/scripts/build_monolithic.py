#!/usr/bin/env python3
"""Build an Arm B (monolithic) eval workspace.

Fairness rules (docs/eval-design.md section 2):
- Same information: everything Arm A can ever load is concatenated into ONE
  stage contract — CLAUDE.md, root CONTEXT.md, _config/*, shared/*, and every
  stage's CONTEXT.md + references/. Nothing withheld, nothing extra.
- Same budget: tokenBudget = 3x the per-stage budget (one run replaces three).
- Same output contract: report.md + audit.md per the stage 03 contract.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from build_workspace import REPO, git_init, load_task, write_runner_config

STAGE_NAME = "01_deliverable"

CLAUDE_MD = """# Workspace Identity

You are the agent for a single-stage workspace. The entire job — instructions,
reference material, and output contract — is in `stages/01_deliverable/CONTEXT.md`.
Read it and produce the outputs it specifies in `stages/01_deliverable/output/`.
"""

CONTEXT_MD = """# Task Routing

| User wants to... | Go to |
|---|---|
| Produce the client report (research, analysis, and writing in one pass) | `stages/01_deliverable/` |
"""

PREAMBLE = """# Stage 01: Deliverable (single pass)

**Job:** Research the client's question, analyze the findings, and write the
client-ready report — in one pass. All reference material that governs this
work is included below.

## Outputs

| File | Contents |
|---|---|
| `output/report.md` | The full client-ready report |
| `output/audit.md` | Trace table: each report section -> supporting evidence citation(s); plus any claim that could not be traced |

Follow the citation, labeling, and metadata-block rules in the conventions
section below. Every reference document that follows applies to this task.

---
"""


def concat_sources(brief_text: str) -> str:
    parts: list[str] = [PREAMBLE]

    def add(title: str, text: str) -> None:
        parts.append(f"\n\n<!-- ======== {title} ======== -->\n\n{text.strip()}\n")

    add("workspace guide (original CLAUDE.md)", (REPO / "CLAUDE.md").read_text())
    add("original routing (CONTEXT.md)", (REPO / "CONTEXT.md").read_text())
    for f in sorted((REPO / "_config").glob("*.md")):
        add(f"_config/{f.name}", f.read_text())
    add("shared/client-brief.md", brief_text)
    for f in sorted((REPO / "shared").glob("*.md")):
        if f.name != "client-brief.md":
            add(f"shared/{f.name}", f.read_text())
    for stage_dir in sorted((REPO / "stages").iterdir()):
        if not stage_dir.is_dir():
            continue
        add(f"stage contract: {stage_dir.name}/CONTEXT.md", (stage_dir / "CONTEXT.md").read_text())
        for ref in sorted(stage_dir.glob("references/*.md")):
            add(f"{stage_dir.name}/references/{ref.name}", ref.read_text())
    return "".join(parts)


def build_arm_b(task: dict, dest: Path, model: str | None = None) -> Path:
    if dest.exists():
        shutil.rmtree(dest)
    stage = dest / "stages" / STAGE_NAME
    (stage / "output").mkdir(parents=True)
    (stage / "output" / ".gitkeep").touch()
    (dest / "CLAUDE.md").write_text(CLAUDE_MD)
    (dest / "CONTEXT.md").write_text(CONTEXT_MD)
    (stage / "CONTEXT.md").write_text(concat_sources(task["brief_text"]))
    write_runner_config(dest, task, model, budget_multiplier=3)
    git_init(dest)
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task_id", help="folder name under eval/tasks/")
    parser.add_argument("dest", type=Path, help="workspace directory to create")
    parser.add_argument("--model", default=None, help="override model slug (must be in VETTED_MODELS)")
    args = parser.parse_args()
    ws = build_arm_b(load_task(args.task_id), args.dest, args.model)
    print(f"Arm B workspace ready: {ws}")


if __name__ == "__main__":
    main()
