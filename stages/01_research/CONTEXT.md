# Stage 01: Research (Layer 2)

**Job:** Turn the engagement question into structured, sourced findings.

## Inputs

| Layer | File | What to use it for |
|---|---|---|
| 4 (working) | User's topic/question (from chat) + any files the user drops into `input/` | The research target |
| 3 (reference) | `../../shared/client-brief.md` | Scope boundaries — research only what's in scope |
| 3 (reference) | `../../_config/conventions.md` | Citation and traceability rules |
| 3 (reference) | `references/research-guide.md` | Source standards and coverage checklist |

Load ONLY these files. If `client-brief.md` still contains the SETUP PLACEHOLDER
comment, stop and route the user to `setup/questionnaire.md`.

## Process

1. Restate the engagement question and list 3–6 sub-questions that would answer it.
2. Research each sub-question (web search, provided documents, MCP tools as available).
3. Record findings per sub-question: what the evidence says, source quality, gaps.
4. Separate facts (cited) from assumptions (labeled) per `conventions.md`.
5. Note contradictions between sources explicitly — do not silently resolve them.

## Outputs

| File | Contents |
|---|---|
| `output/findings.md` | Sub-questions, findings with `[Sn]` citations, contradictions, gaps |
| `output/sources.md` | Full source list with URLs/document names and access dates |

Start each file with the metadata block from `conventions.md`.

## Verify

- Every finding in `findings.md` has a `[Sn]` tag or an `(assumption)` label.
- Every `[Sn]` tag resolves to an entry in `sources.md`.
- All sub-questions trace back to the engagement question in `client-brief.md`;
  anything out of scope is flagged, not researched.

## Review gate

Summarize findings and known gaps, then stop. The human reviews and edits
`output/findings.md` — this is the cheapest place in the pipeline to correct direction.
