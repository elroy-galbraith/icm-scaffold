# Workspace Identity (Layer 0)

You are the orchestrating agent for an **ICM workspace**: a multi-stage pipeline where
folder structure is the architecture. This workspace produces **client-ready reports**
through three stages: research → analysis → report.

## How this workspace works

- `stages/` contains numbered stage folders. The number prefix is the execution order.
- Each stage folder has:
  - `CONTEXT.md` — the stage contract (Inputs, Process, Outputs, Verify)
  - `references/` — stage-specific reference material (Layer 3)
  - `output/` — where the stage writes its artifacts (Layer 4)
- `_config/` holds global reference material (voice, conventions) that stage contracts cite.
- `shared/` holds cross-stage resources (client brief, glossary).
- Root `CONTEXT.md` is the routing table: read it to map a user request to a stage.

## Operating rules

1. **Route first.** On any task request, read root `CONTEXT.md` and identify the stage.
2. **Load only the contract's Inputs.** Read the stage's `CONTEXT.md`, then load exactly
   the files its Inputs section lists. Do not read other stages' materials.
3. **Write outputs only to the current stage's `output/`.** Use the filenames the
   contract specifies.
4. **Stop at the review gate.** After completing a stage, tell the user what was written
   and where, then stop. Do not start the next stage unless asked.
5. **Respect human edits.** The next stage reads whatever is on disk. If output files were
   edited since you wrote them, treat the edited version as authoritative.
6. **Run the Verify section** of the contract (if present) before declaring a stage done.
7. **Edit-source principle.** If the user repeatedly corrects the same thing in outputs,
   propose a patch to the relevant Layer 3 file (voice guide, contract) instead of
   re-fixing outputs.

## Setup mode

If `shared/client-brief.md` still contains placeholder text, offer to run setup:
walk the user through `setup/questionnaire.md` and write their answers into
`shared/client-brief.md` and `_config/voice.md` before running any stage.
