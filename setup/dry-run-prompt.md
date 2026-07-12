# Dry-Run Prompt

Copy-paste this to a coding agent opened at the repo root to generate the worked example.

---

Read CLAUDE.md and CONTEXT.md, then do a full dry run of this ICM pipeline so the repo ships with a worked example. Follow the methodology exactly — this run is itself a demonstration of the system.

**Sample engagement (use this to fill the workspace):**

- Client: "Meridian Outdoor Gear", a mid-size US e-commerce retailer (camping/hiking equipment)
- Reader: their COO — senior, time-poor, commercially literate, not technical
- Question: "Should we adopt AI agents for customer support, and if so, how should we start?"
- Decision informed: whether to fund a support-automation pilot next quarter
- In scope: support automation options, cost/benefit, risks, implementation path
- Out of scope: vendor selection, marketing automation
- Length target: 2–4 page brief
- Evidence standard: public sources fine; flag uncertainty and proceed

**Steps:**

1. **Setup:** Rewrite `shared/client-brief.md` from the details above (remove the SETUP PLACEHOLDER comment). Update the Audience section of `_config/voice.md`. Add 3–5 relevant terms to `shared/glossary.md`.
2. **Stage 01:** Follow `stages/01_research/CONTEXT.md` exactly — load only its listed Inputs, use real web research, produce `findings.md` and `sources.md` with proper [Sn] citations. Run its Verify section. Then STOP and show me a summary (review gate — wait for my go-ahead).
3. **Stage 02:** On my go-ahead, follow `stages/02_analysis/CONTEXT.md`. Produce `insights.md` and `recommendations.md`, including the counter-case. Run Verify. STOP for review.
4. **Stage 03:** On my go-ahead, follow `stages/03_report/CONTEXT.md`. Produce `report.md` and `audit.md`. Run the cross-stage Verify.
5. **Package as a shipped example:** Copy the configured `client-brief.md`, both `_config` edits, and all six stage outputs into `examples/meridian-support-automation/`, mirroring the stage folder structure (outputs in `stages/` stay gitignored; the `examples/` copy is what gets committed). Add a short `examples/meridian-support-automation/README.md` explaining what the example shows and that all content was produced by the pipeline. Then restore `shared/client-brief.md`, `_config/voice.md`, and `shared/glossary.md` to their template state, and empty the stage `output/` folders.
6. **Commit** with message: `Add worked example: Meridian support-automation brief (full pipeline dry run)`.

Rules: respect every review gate; never load files a stage contract doesn't list; if a Verify check fails, fix it before proceeding; keep total report length within target.
