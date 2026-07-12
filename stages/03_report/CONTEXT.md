# Stage 03: Report (Layer 2)

**Job:** Assemble insights and recommendations into the client-ready deliverable.

## Inputs

| Layer | File | What to use it for |
|---|---|---|
| 4 (working) | `../02_analysis/output/insights.md` | Body content — human-edited version is authoritative |
| 4 (working) | `../02_analysis/output/recommendations.md` | Recommendations section |
| 4 (working) | `../01_research/output/sources.md` | Final source list |
| 3 (reference) | `../../shared/client-brief.md` | Audience, length target, required sections |
| 3 (reference) | `../../_config/voice.md` | Internalize as writing constraints |
| 3 (reference) | `../../_config/conventions.md` | Citation and traceability rules |
| 3 (reference) | `references/report-structure.md` | Section order and length discipline |

Load ONLY these files. Do NOT re-read `findings.md` — stage 02 already distilled it;
going around the analysis stage breaks the audit trail.

## Process

1. Draft per `report-structure.md`, within the length target from `client-brief.md`.
2. Executive summary last (write it after the body, place it first).
3. Carry `[Sn]` citations through; final Sources section from `sources.md`
   (only sources actually cited in the report).
4. Apply `voice.md` throughout.

## Outputs

| File | Contents |
|---|---|
| `output/report.md` | The full client-ready report |
| `output/audit.md` | Trace table: each report section → insight(s) → finding citation(s); plus any claim that could not be traced |

Start each file with the metadata block from `conventions.md`.

## Verify (cross-stage audit)

- Every substantive claim in `report.md` traces to stage 02 insights and stage 01
  citations — record the trace in `audit.md`.
- No orphan recommendations (present in report but absent from stage 02 output).
- Length within the `client-brief.md` target; if over, cut per `report-structure.md`
  priority order, don't compress evidence.

## Review gate

Deliver `report.md` and flag anything `audit.md` could not trace. The human does final
review. If they request recurring changes (tone, structure), propose patching
`voice.md` or `report-structure.md` — fix the factory, not the product.
