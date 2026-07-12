# ICM Scaffold — Folder Structure as Agentic Architecture

A production-ready scaffold implementing the **Interpretable Context Methodology** (ICM):
multi-stage AI workflows orchestrated by *filesystem structure* instead of an agent framework.

> **The pitch in one paragraph:** Your SOPs are already prompts — written for humans.
> Turning them into automation normally means translating them into code or a vendor's
> workflow builder, where they die. ICM lets an SOP stay a document — readable, editable
> by the process owner, git-diffable — and become executable. Every run is auditable,
> every human approval is on the record, and recurring corrections flow back into the
> source documents so the system improves per run. No framework lock-in (plain markdown),
> no model lock-in (one config line), no cloud lock-in (any S3-compatible store). And if
> you leave, you keep the folder — still your SOP library, in plain text.

> Based on: Van Clief & McDermott, *Interpretable Context Methodology: Folder Structure as
> Agentic Architecture* ([arXiv:2603.16021](https://arxiv.org/abs/2603.16021)), MIT licensed.

## The idea in 30 seconds

No LangChain. No CrewAI. No orchestration code.

- **Numbered folders are stages.** `stages/01_research/` runs before `stages/02_analysis/`.
- **Markdown files are the prompts.** Each stage has a `CONTEXT.md` contract: Inputs → Process → Outputs.
- **Files on disk are the state.** Stage N writes to its `output/`; stage N+1 reads from there.
- **Humans are the review gate.** Edit any `output/` file before running the next stage — the pipeline picks up your edits.

One orchestrating agent (Claude Code, or any capable coding agent) reads the right files at the
right moment. The folder hierarchy is both the human's control surface and the model's
orchestration logic.

## Quickstart

```bash
git clone <this-repo> my-client-project
cd my-client-project
claude   # or your agent of choice
```

Then tell the agent:

> "Run stage 01 for topic: <your topic>"

Review `stages/01_research/output/`, edit anything you disagree with, then:

> "Run stage 02" ... "Run stage 03"

The included example pipeline produces a client-ready report: **research → analysis → report**.

## The five context layers

| Layer | Location | Answers | Loaded |
|---|---|---|---|
| 0 | `CLAUDE.md` | Where am I? | Always |
| 1 | `CONTEXT.md` (root) | Where do I go? | Always |
| 2 | `stages/NN_*/CONTEXT.md` | What do I do? | Current stage only |
| 3 | `_config/`, `shared/`, `references/` | What rules apply? | Only files listed in the stage's Inputs |
| 4 | `stages/NN_*/output/` | What am I working with? | Only files listed in the stage's Inputs |

Layers 0–2 route. Layer 3 is **the factory** (voice, conventions — configured once).
Layer 4 is **the product** (working artifacts — new every run). Each stage loads
~2k–8k tokens instead of one 40k+ monolithic prompt.

## Repo map

```
CLAUDE.md                  Layer 0 — workspace identity
CONTEXT.md                 Layer 1 — task routing
_config/                   Layer 3 — global: voice, conventions
shared/                    Layer 3 — cross-stage resources (glossary, client brief)
setup/questionnaire.md     Configure this workspace for a new client
templates/                 Copy-paste templates for new stages
stages/
  01_research/             Topic → structured findings
  02_analysis/             Findings → insights & recommendations
  03_report/               Insights → client-ready report
```

## Adapting for a client project

1. Fill in `setup/questionnaire.md` (or have the agent interview the client with it).
2. Update `_config/voice.md` and `shared/client-brief.md` from the answers.
3. Rename/add stages as needed — copy `templates/stage-CONTEXT.template.md`, keep the
   `NN_` numeric prefix, define the Inputs/Process/Outputs contract.
4. Update the routing table in root `CONTEXT.md`.

That's the whole customization surface. Everything is plain text, git-diffable, and portable —
handing off the project is copying the folder.

## Design rules (don't break these)

1. **One stage, one job.** If a stage does two transforms, split it.
2. **Plain text interfaces.** Stages exchange markdown/JSON only.
3. **Load only what the contract lists.** No stage reads everything.
4. **Every output is an edit surface.** Never overwrite human edits without asking.
5. **Fix the source, not the output.** If you keep editing the same thing in outputs,
   patch the voice guide or stage contract instead.

## License

MIT. Methodology credit: Van Clief & McDermott (arXiv:2603.16021).
