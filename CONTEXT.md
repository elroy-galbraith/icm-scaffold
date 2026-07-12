# Task Routing (Layer 1)

Map the user's request to a stage. Then open that stage's `CONTEXT.md` and follow its contract.

## Routing table

| User wants to... | Go to | Precondition |
|---|---|---|
| Configure workspace for a new client/project | `setup/questionnaire.md` | — |
| Research a topic / gather findings | `stages/01_research/` | `shared/client-brief.md` is filled in |
| Analyze findings / extract insights | `stages/02_analysis/` | `stages/01_research/output/` has findings |
| Produce the client report | `stages/03_report/` | `stages/02_analysis/output/` has analysis |
| Change tone/voice of outputs | edit `_config/voice.md` | — |
| Add or modify a stage | copy `templates/stage-CONTEXT.template.md` | update this routing table after |

## Shared resources (Layer 3, cited by stage contracts)

- `_config/voice.md` — how all prose should sound
- `_config/conventions.md` — file naming, formatting, citation rules
- `shared/client-brief.md` — who the client is, what they need, scope
- `shared/glossary.md` — domain terms used consistently across stages

## Pipeline at a glance

```
topic ──▶ 01_research ──▶ 02_analysis ──▶ 03_report ──▶ deliverable
              │                │               │
           output/          output/         output/
          (findings)       (insights)       (report)
              ▲                ▲               ▲
        human review     human review    human review
```

Each arrow is a review gate: the human may edit any `output/` file before the next stage runs.
