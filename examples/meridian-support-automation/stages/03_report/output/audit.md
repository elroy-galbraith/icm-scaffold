<!-- stage: 03_report | run: 2026-07-12 | inputs: ../02_analysis/output/insights.md, ../02_analysis/output/recommendations.md, ../01_research/output/sources.md -->

# Audit Trail: report.md → stage 02 insights → stage 01 findings/citations

Cross-stage verification per `03_report/CONTEXT.md`. Word count: 1,591 words
(within the 2–4 page brief target from `client-brief.md`).

| Report section | Traces to (stage 02) | Findings citations (stage 01) |
|---|---|---|
| Executive summary — fund narrow pilot | Insight 1, Insight 2, Insight 4, Recommendation 1 | [S1][S2][S3][S8][S15] (narrow scope); [S10][S11][S12][S13][S14] (risk framing) |
| Executive summary — risk framing | Insight 2 | [S10][S11][S12][S13][S14] |
| Executive summary — baseline/proof framing | Insight 4 | (gap, stage 01 — no [Sn], correctly uncited) |
| The question and scope | — (from `shared/client-brief.md` directly, not stage 02) | n/a |
| "Narrow automation, not broad automation..." | Insight 1 | [S1][S2][S3][S4][S8][S15] |
| "The real exposure is legal and reputational..." | Insight 2 | [S10][S11][S12][S13][S14] |
| "Published ROI figures are not a usable budget number..." | Insight 3 | [S1][S3][S6] |
| "Meridian's own baseline data doesn't yet exist..." | Insight 4 | (gap, stage 01 — no [Sn], correctly uncited) |
| Recommendation 1 (narrow pilot, hard handoff) | Recommendation 1 → Insight 1, Insight 2 | [S1][S2][S3][S8][S10][S11][S15] |
| Recommendation 2 (go/no-go metrics, 90-day) | Recommendation 2 → Insight 4, Insight 5 | (Insight 5 is uncited-by-design, an inference from [S5] + [S8][S15]) |
| Recommendation 3 (baseline data pull) | Recommendation 3 → Insight 3, Insight 4 | [S1][S3][S6] |
| Recommendation 4 (legal review) | Recommendation 4 → Insight 2 | [S10][S11] |
| Recommendation 5 (disclosure + escalation) | Recommendation 5 → Insight 2 | [S12][S13][S14] |
| Counter-case & limitations | Counter-case (stage 02) | [S1][S5][S12][S13][S14] |
| Sources | Carried from `../01_research/output/sources.md`, filtered to only those cited above | S1, S2, S3, S4, S5, S6, S8, S10, S11, S12, S13, S14, S15 |

## Notes

- Insight 5 (governance-driven project failure) is not quoted verbatim in the report
  body but underlies Recommendation 2's rationale; it is itself a stage-02 inference
  from [S5] plus the practitioner pattern in [S8][S15] — labeled "medium confidence" in
  `02_analysis/output/insights.md` and not overstated here.
- Sources [S7] and [S9] (vendor pricing detail) from stage 01 were deliberately not
  carried into the report — vendor selection is out of scope per `client-brief.md`,
  and stage 02 did not build any insight or recommendation on them.
- No claim in `report.md` could not be traced to either a stage-02 insight or an
  explicitly labeled stage-01 gap. No orphan recommendations: all five report
  recommendations correspond one-to-one with `02_analysis/output/recommendations.md`.
