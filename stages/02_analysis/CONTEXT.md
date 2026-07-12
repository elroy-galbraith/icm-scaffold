# Stage 02: Analysis (Layer 2)

**Job:** Turn research findings into insights and defensible recommendations.

## Inputs

| Layer | File | What to use it for |
|---|---|---|
| 4 (working) | `../01_research/output/findings.md` | The evidence base — treat as authoritative, including human edits |
| 4 (working) | `../01_research/output/sources.md` | Carry citation tags forward |
| 3 (reference) | `../../shared/client-brief.md` | The decision this analysis must inform |
| 3 (reference) | `../../_config/conventions.md` | Citation and traceability rules |
| 3 (reference) | `references/analysis-framework.md` | How to structure the reasoning |

Load ONLY these files. If `findings.md` is missing or empty, stop: stage 01 has not run.

## Process

1. Read findings; list the 3–5 insights that matter most for the client's decision.
2. For each insight: state it in one sentence, support it with cited findings,
   note confidence (high/medium/low) and what would change your mind.
3. Derive recommendations: each must trace to at least one insight and address the
   decision named in `client-brief.md`.
4. Write the counter-case: the strongest argument against the main recommendation,
   built from the same evidence.

## Outputs

| File | Contents |
|---|---|
| `output/insights.md` | Insights with citations, confidence levels, and the counter-case |
| `output/recommendations.md` | Recommendations, each mapped to insights, with risks and first steps |

Start each file with the metadata block from `conventions.md`.

## Verify

- Every insight cites at least one `[Sn]` finding from stage 01; no new uncited facts
  introduced at this stage.
- Every recommendation maps to at least one insight.
- The counter-case exists and is not a strawman (it cites evidence too).

## Review gate

Present insights and recommendations in brief, then stop. The human may reweight,
strike, or add before the report stage runs.
