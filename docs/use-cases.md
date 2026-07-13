# ICM Commercial Use Cases

Where this scaffold becomes a revenue asset rather than an artifact. Companion to
`mvp-spec.md`.

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

## Positioning

**The core insight: SOPs are already prompts — written for humans.** Companies spent
years writing standard operating procedures; the pain is that automating an SOP
normally means translating it into code or a vendor's workflow builder, where the
process owner can no longer read or change it. ICM lets the SOP stay a document —
readable, editable, git-diffable — and become executable. The buyer isn't adopting
"AI workflows"; they're making the process documentation they already trust run.

The sellable claim is never "AI makes the decision." It is:

> The decision package assembles itself. Every number traces to a source document.
> Your people decide, through your existing workflow, faster.

The no-lock-in story closes procurement conversations: no framework (plain markdown),
no model lock (an OpenRouter slug in a config file), no cloud lock (docker-compose +
any S3-compatible store). Exit story: they keep the folder, and it's still their SOP
library in plain text. Competing platforms cannot say that sentence.

**Caveat to state proactively:** "codify your existing SOPs" undersells discovery.
SOPs describe the process people are supposed to follow; the first live case reveals
the one they actually follow. That gap is why accompaniment is priced into the
delivery model — and why this is defensible consulting work, not just software setup.

Three assets carry the value — the scaffold itself is MIT-licensed convention and not
defensible:

1. **Configured workspaces** — stage contracts and reference guides that encode a firm's
   process and tribal knowledge (the "factory")
2. **The platform** (see `mvp-spec.md`) — gates, RBAC, audit trail, deploy anywhere
3. **Measured case studies** — instrumented time-to-decision improvements

---

## Use case 1: RBF deal-memo pipeline (primary — validate here first)

Revenue-based financing underwriting is a staged, document-heavy pipeline with a
mandated human decision at the end. It maps one-to-one onto ICM.

### Pipeline design

| Stage | Job | Script (deterministic) | LLM (synthesis) | Gate reviewer |
|---|---|---|---|---|
| `01_intake` | Normalize application + docs into structured inputs | Parse bank statements / processor exports to JSON; completeness checklist | Flag anomalies in narrative form; list missing items | Analyst |
| `02_revenue_quality` | Assess revenue durability | Cohort analysis, concentration ratios, seasonality decomposition, growth/churn calcs | Interpret computed figures; identify qualitative risks (platform dependency, category trends) | Analyst |
| `03_risk_assessment` | Score against credit policy | Covenant checks, threshold flags, policy-rule evaluation against `_config/credit-policy.md` | Steelman counter-case; comparable-deal narrative; exceptions requiring judgment | Senior underwriter |
| `04_deal_memo` | Assemble committee package | Assemble figures/tables directly from stage outputs; length + trace validation | Memo narrative only — contractually forbidden from introducing uncited figures | Credit committee (the existing meeting, unchanged) |

### The determinism boundary

The paper's own principle — scripts for mechanical work, LLM for synthesis — is the
control that makes this credible in a risk context:

- All math lives in versioned Python scripts inside each stage: same input → same
  output, unit-testable, reviewable by risk/model governance as ordinary code.
- The LLM writes narrative around computed numbers. Stage contracts forbid it from
  producing figures without a `[Sn]` citation or `(computed: script-name)` tag.
- `audit.md` (stage 04 output) traces every memo claim → analysis output → source
  document. This is the artifact compliance and model-risk reviewers ask for.

### Why the gates are the insurance

The system cannot advance past a stage without a named human approving on the record
(git commit = who, what, when). The committee decision process is untouched — the
product only compresses preparation time. Positioning for model-risk conversations:
**decision support, not decisioning.** No adverse-action automation, no autonomous
credit actions.

### Validation plan (= M0/M1 from `mvp-spec.md`)

1. Baseline: measure current time from complete application → committee-ready memo
   across ~10 recent deals.
2. Build the four-stage workspace; run 3–5 live deals in parallel with the manual
   process (shadow mode).
3. Compare: prep time, error/correction counts at committee, analyst hours.
4. One instrumented case study is the asset that sells everything else.

---

## Use case 2: Consultancy delivery accelerator (Jamaica portfolio)

Each engagement gets a configured workspace. Deliverables become reproducible,
git-auditable, and handoff is copying a folder.

### Jamaica Stock Exchange — issuer filing / compliance review

Pipeline: `01_intake` (filing docs) → `02_completeness` (rule-based checklist, scripted)
→ `03_substantive_review` (LLM flags issues against listing-rule references in Layer 3)
→ `04_review_memo`. Regulator-adjacent work rewards exactly what ICM provides:
every flag cites the rule and the document location it came from.

### JMEA — member export-readiness assessments

Pipeline: `01_member_intake` → `02_readiness_scoring` (scripted rubric) →
`03_gap_analysis` → `04_member_report`. High-volume, template-driven, per-member
repetition — the "duplicate the workspace folder" pattern from the paper. A productized
per-assessment service, not bespoke consulting.

### JN Bank — AVM platform report layer

**Boundary (be precise in the pitch):** ICM does not go near the valuation model.
The AVM stays a validated quantitative system. ICM wraps the *report layer*:

Pipeline: `01_evidence` (pull AVM output + comparables via script) →
`02_comparables_documentation` → `03_appraisal_narrative` (LLM narrative around AVM
numbers, forbidden from altering them) → `04_valuation_report` + `audit.md`.
Value: the AVM's output becomes more defensible — every report traces to model output
and documented comparables. This sells to the bank's risk function, not against it.

---

## Competitive landscape (positioning, not dunking)

Three categories get compared to this platform. Each solves a different layer;
misidentifying the layer loses the deal.

### n8n / Zapier / Make — integration orchestration

The program is a node graph moving data between systems. Excellent at high-volume,
event-driven plumbing, with real HITL support (approval steps on agent tool calls,
wait nodes) and enterprise audit logs. Take them seriously. The differences are
specific:

| Audit question | n8n answers | This platform answers |
|---|---|---|
| Who approved which action, when? | Yes — action-level logs | Yes — git commits |
| Does this figure trace to a source document? | No claim-level equivalent | `[Sn]` citations + `audit.md` trace table |
| How did the process definition change between March and June? | Diff a JSON node graph (unreadable in practice) | Diff prose contracts — legible to the process owner |
| What do we keep if we leave? | Exported JSON, meaningless without n8n | The folder — still readable SOP documentation |

**Positioning line:** *n8n automates data movement; we automate judgment work under
supervision.* Complementary, not rival — n8n is a fine way to feed a stage's `input/`
folder or fan out an approved report, and many clients already run it. Pitch
alongside, never against. Concede outright: high-volume, low-judgment, no-document
workflows belong in n8n (see "Where ICM does not fit").

### LangChain / CrewAI / AutoGen — developer frameworks

Orchestration expressed in code, owned by engineers. This is what the ICM paper
explicitly positions against: the process definition migrates out of documents into a
codebase the process owner can't read or change, plus framework churn. Not a
competitor for our buyer — it's what a client's dev team might build instead of
buying anything. Counter: total cost of ownership (maintenance, key-person risk) and
"who in your risk function can read the workflow definition?"

### Vertical AI point solutions (per-domain underwriting/compliance tools)

Strong in their niche, opaque by design, and lock the process into the vendor's
model of it. Counter with the exit story and the fact that the client's own SOP
remains the source of truth here. Watch for these in the RBF space specifically —
they'll have deeper domain features; our edge is auditability + process ownership,
not feature count.

## Where ICM does not fit (say this proactively — it builds trust)

- Real-time or high-volume low-latency decisioning (fraud scoring, instant approvals)
- The quantitative model itself (AVM, credit scorecards) — those need statistical
  validation, not staged prompts
- Automated mid-pipeline branching on AI judgment — humans branch at gates, by design
- Anything where removing the human gate is the goal

## IP hygiene

Deploying the same base IP across an employer (RBF) and a consultancy requires clean
ownership: keep this scaffold in a personally-owned repo under MIT; license *configured
workspaces* per engagement (the domain contracts are the paid asset). Get the split in
writing before the first internal pilot.
