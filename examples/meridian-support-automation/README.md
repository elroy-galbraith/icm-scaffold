# Worked example: Meridian support-automation brief

This directory is a full, unedited dry run of the ICM pipeline (see the repo root
`CONTEXT.md` and `CLAUDE.md`), shipped so a new user can see what the system produces
end to end before running it on their own engagement.

**Sample engagement:** Meridian Outdoor Gear, a mid-size US e-commerce camping/hiking
retailer, asked whether it should adopt AI agents for customer support and how to
start — informing whether to fund a support-automation pilot next quarter.

## What's here

- `shared/client-brief.md`, `shared/glossary.md`, `_config/voice.md` — the workspace
  as configured for this engagement (output of the setup step).
- `stages/01_research/output/` — `findings.md` and `sources.md`, produced by following
  `stages/01_research/CONTEXT.md` with real web research and `[Sn]` citations.
- `stages/02_analysis/output/` — `insights.md` and `recommendations.md`, produced by
  following `stages/02_analysis/CONTEXT.md`, including the required counter-case.
- `stages/03_report/output/` — `report.md` (the client-ready deliverable) and
  `audit.md` (the cross-stage citation trace), produced by following
  `stages/03_report/CONTEXT.md`.

## How it was produced

Every file in this directory was written by an agent following the pipeline's own
stage contracts — each stage loaded only the Inputs its `CONTEXT.md` listed, ran its
Verify checks, and stopped at its review gate for human sign-off before the next stage
began. No content here was hand-written outside that process. The prompt used to
generate this run is `setup/dry-run-prompt.md` at the repo root.

## Using this example

Read `stages/03_report/output/report.md` for the final deliverable, or start from
`shared/client-brief.md` and follow the pipeline stage by stage to see how each
artifact built on the last. This is reference material only — the live `stages/*/output/`
and `shared/`/`_config/` files in the repo root are reset to their template state after
each real engagement (and are gitignored), so this `examples/` copy is the only
committed record of a completed run.
