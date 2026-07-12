<!-- stage: 02_analysis | run: 2026-07-12 | inputs: ../01_research/output/findings.md, ../01_research/output/sources.md, ../../shared/client-brief.md, ../../_config/conventions.md, references/analysis-framework.md -->

# Recommendations: AI Agents for Customer Support at Meridian Outdoor Gear

Ordered by impact on the funding decision, not by topic. Max 5.

## 1. Fund a narrow, single-workflow pilot — not a broad support-automation rollout

- **Maps to:** Insight 1, Insight 2, counter-case resolution
- **Action:** Scope the pilot to order-status ("where is my order") and returns/exchange
  status queries only, on one channel (web chat), with a hard rule that any query
  outside that scope routes straight to a human — no best-effort answers on policy
  exceptions.
- **Owner:** Head of Customer Support, sponsored by COO
- **First step:** Confirm WISMO/returns ticket volume from the last 90 days is large
  enough to make a pilot statistically informative (this checks the assumption flagged
  in the counter-case) before any vendor commitment.
- **Main risk:** Scope creep — pressure to expand the agent into judgment-heavy ticket
  types (warranty disputes, damaged-goods claims) before the narrow workflow is proven.

## 2. Set go/no-go metrics and a 90-day evaluation date before the pilot starts

- **Maps to:** Insight 4, Insight 5
- **Action:** Define target thresholds in advance — deflection rate, CSAT delta vs.
  baseline, escalation rate, and a manually-sampled error/hallucination rate — and
  commit to a explicit continue/stop decision at 90 days.
- **Owner:** COO, with Head of Customer Support
- **First step:** Draft the metrics and thresholds document before issuing any RFP or
  vendor demo.
- **Main risk:** Without pre-committed thresholds, a pilot can drift into permanence
  regardless of performance — this is the governance failure Gartner ties to the
  40%+ project cancellation rate (Insight 5).

## 3. Pull Meridian's own baseline data in parallel with vendor evaluation, not after

- **Maps to:** Insight 3, Insight 4
- **Action:** Quantify current cost-per-ticket, ticket volume by category, and CSAT
  baseline for the target workflow before or alongside vendor conversations, so ROI
  can be evaluated against Meridian's actual numbers instead of published cross-industry
  multiples.
- **Owner:** CS Operations, with Finance
- **First step:** Two-week internal data pull covering the last 90 days of tickets.
- **Main risk:** Running this sequentially before any vendor engagement would delay the
  pilot a full quarter; run it in parallel with recommendation 1's first step instead.

## 4. Bake AI-liability review into procurement, explicitly informed by the Air Canada precedent

- **Maps to:** Insight 2
- **Action:** Have legal review any vendor contract's liability terms for AI-generated
  misstatements before signing, and require the pilot's escalation design to guarantee
  no unsupervised answers on policy exceptions or edge cases (mirroring the specific
  failure mode in *Moffatt v. Air Canada*).
- **Owner:** Legal, with Head of Customer Support
- **First step:** Legal review of the liability/indemnification clause in any shortlisted
  vendor's master service agreement.
- **Main risk:** Adds time to procurement — acceptable given the demonstrated legal
  exposure; do not skip to hit a launch date.

## 5. Disclose AI use to customers and preserve an unambiguous path to a human

- **Maps to:** Insight 2
- **Action:** Do not silently swap live chat with an AI agent. Tell customers when
  they're interacting with an AI agent and guarantee a one-step path to a human at any
  point in the conversation.
- **Owner:** CX/Support leadership, with Marketing for customer-facing messaging
- **First step:** Draft the disclosure and escalation-path language before pilot launch.
- **Main risk:** Low execution risk, but skipping this is the single fastest way to
  trigger the trust-erosion and switching behavior documented in Insight 2 — the
  cost of doing this is small relative to the downside of not doing it.
