<!-- stage: 01_research | run: 2026-07-12 | inputs: ../../../shared/client-brief.md, ../../../_config/conventions.md, references/research-guide.md -->

# Research Findings: AI Agents for Customer Support at Meridian Outdoor Gear

## Engagement question

Should Meridian Outdoor Gear adopt AI agents for customer support, and if so, how should
it start? (Decision informed: whether to fund a support-automation pilot next quarter.)

## Sub-questions

1. What is the current state of AI-agent adoption in customer support, and how fast is
   the market moving?
2. What cost/benefit (ROI, deflection rates, cost per interaction) can a company like
   Meridian realistically expect?
3. Who are the main vendors/options, and how do they price?
4. What are the material risks — legal, operational, and customer-trust?
5. What does a sound, low-risk pilot implementation path look like?
6. Is there anything specific to retail/e-commerce support that changes the calculus?

---

## 1. Current state and trend

- The AI customer service software market is sized at roughly $12–15B in 2026, growing
  at a ~25.8% CAGR toward the high tens of billions by the early 2030s [S1][S2].
- Adoption is broad but shallow: 88% of contact centers report using *some* form of AI,
  but only 25% have it fully integrated into daily operations [S1]. A separate estimate
  puts full AI-agent deployment (as opposed to simpler AI features) at only 17% of
  organizations today, with 60%+ expecting to deploy within two years [S3]. These two
  figures are not contradictory once read carefully — one measures "any AI use," the
  other "autonomous agent deployment" — but the gap itself is the finding: most
  "AI in customer service" today is assistive (drafting, routing), not autonomous.
  **(contradiction/definitional gap — flagged, not resolved)**
- Sector adoption is led by telco/tech (~90%) and retail (~80%) [S1]. Retail is
  ahead of the average enterprise, consistent with the WISMO/returns-heavy ticket mix
  common to e-commerce [S3][S8].
- Gartner (a primary industry-analyst source) predicts agentic AI will autonomously
  resolve 80% of *common* customer service issues by 2029, with an associated ~30%
  operational cost reduction for adopters [S4]. Gartner also predicts more than 40% of
  agentic AI projects will be canceled by the end of 2027 due to cost overruns, unclear
  business value, or inadequate risk controls [S5]. Both predictions come from the same
  analyst house and should be read together: the technology's ceiling is real, but the
  failure rate among current projects is also real.

## 2. Cost/benefit and ROI

- Reported deflection rates (share of Tier-1 contacts resolved without a human) vary
  widely: median ~41% across enterprise CX programs in 2026, top quartile ~59%, and
  "world-class" deployments with a well-maintained knowledge base cited as high as
  50–70% [S2][S3]. **(wide range — treat vendor-adjacent top-end figures with caution;
  single source for the 50–70% figure — (single source))**
  Two independent sources converge on the ~41%/~59% median/top-quartile figures [S2][S3].
- Cost per resolved interaction: AI-handled interactions are reported at roughly
  $0.50–$2.00 versus $6–$13.50 for a human agent [S3][S6]; one source gives a tighter
  $0.62 vs $7.40 comparison [S1]. Two independent sources support an order-of-magnitude
  (3–10x) cost advantage per resolved ticket [S1][S3].
- ROI claims: companies report 3.5x–8x ROI [S1], and a separate source cites 340%
  first-year ROI ($3.50 returned per $1 invested) [S6]. These are consistent in
  direction (strong positive ROI) but not directly comparable in methodology —
  treat exact multiples as illustrative, not a number Meridian should plan a budget
  around. **(assumption: Meridian's own numbers will differ materially by ticket mix
  and starting cost base)**
- The most concrete named case is Klarna, which shipped an OpenAI-built assistant
  handling 2.3M conversations in its first month (~700 FTE-equivalent) and sized avoided
  hiring cost at $40M/year [S6]. This is a single large fintech, not an e-commerce
  retailer of Meridian's size — informative as an upper bound, not a benchmark
  **(single source; scale mismatch flagged)**.
- First-year support-cost reduction from well-implemented deployments is reported at
  30–40%, with total economic impact (including hiring avoidance, retention, training
  efficiency) 2–3x larger than the raw labor-cost reduction alone [S2].

## 3. Vendor landscape and pricing (informational — vendor selection is out of scope)

- Pricing models cluster into: per-outcome/per-resolution, per-conversation, platform
  fee + usage, and custom enterprise contracts [S7].
- Representative published per-resolution rates: Quickchat ~$0.50, Intercom Fin ~$0.99,
  Zendesk AI Agents ~$1.50, Salesforce Agentforce ~$2.00 [S7]. Decagon, Sierra, and Ada
  do not publish rates; Decagon starts near $95K/year (~6-week deployment), Sierra
  year-one costs reported at $200K–$350K+, and Agentforce implementations typically run
  $50K–$150K plus $10K–$25K/month ongoing consulting [S7][S9].
- AI-only vendors (Ada, Sierra, Decagon) require a separate human-agent helpdesk
  platform, adding an estimated $55–$175+/agent/month in hidden cost [S7].
- This confirms cost is not just the per-resolution rate: total cost of ownership
  includes integration, a human-agent tool if not already owned, and ongoing tuning.
  **(analyst judgment, drawn from the pricing-structure evidence above)**

## 4. Risks

- **Legal/reputational precedent:** In *Moffatt v. Air Canada* (2024), a small-claims
  tribunal held Air Canada liable for its chatbot's hallucinated bereavement-fare policy,
  rejecting the airline's argument that the bot was a separate legal entity. The tribunal
  found the airline failed its duty of reasonable care to ensure accurate information
  [S10][S11]. The direct damages were small (~$812), but the precedent — a company is
  responsible for what its AI agent tells customers — is the material risk, not the
  dollar amount.
- **Hallucination rate:** even chatbots designed against it hallucinate an estimated
  3%–27% of the time depending on task and guardrails [S10]. **(single source — treat
  as an illustrative range, not a hard number; a pilot should measure Meridian's own
  rate rather than plan around this figure)**
- **Customer trust and brand risk:** multiple 2026 consumer surveys report growing
  backlash: 85% of consumers would rather speak to a human [S12]; a separate survey
  puts the figure at 79% [S13]; 71% prefer human agents per a third [S14]. Trust erosion
  specifically tied to AI use is also reported: 57% say their trust in a business would
  decrease if it relied predominantly on AI for support, and 53% say they'd consider
  switching to a competitor if they learned a company was expanding AI in support [S12].
  Three independent surveys converge directionally (majority preference for humans),
  though the exact percentages vary by methodology — **treat the direction as reliable,
  the specific percentages as approximate**.
- **Project failure rate:** Gartner projects over 40% of agentic AI projects will be
  canceled by end of 2027 for cost, value, or governance reasons [S5]. This is the
  single most important risk figure for a funding decision: the base rate of failure
  for agentic AI initiatives generally is material, independent of vendor choice.

## 5. Implementation path (what "starting well" looks like)

- Best-practice pattern across multiple vendor and practitioner sources [S8][S15]:
  1. Start with a single high-volume, low-complexity workflow — for e-commerce,
     WISMO ("where is my order") and returns/exchanges are the near-universal
     starting point, since they dominate ticket volume and require limited judgment.
  2. Validate against historical tickets (replay last month's real conversations)
     before the agent touches a live customer.
  3. Launch on one channel first (e.g., web chat), not all channels at once.
  4. Guarantee an easy, unambiguous escalation path to a human at any point.
  5. Define success metrics up front — deflection rate, CSAT, average handle time,
     resolution rate — and track them from day one, not retroactively.
  6. Assign a human owner responsible for the agent as a living part of the service
     team, not a "set and forget" deployment.
  7. Keep the underlying knowledge base/help-center content accurate — agent quality
     is bounded by source-content quality.
- This pattern is consistent across two independent practitioner sources [S8][S15] and
  aligns with the general risk-mitigation logic in the legal and trust findings above
  (narrow scope + human-in-the-loop escalation directly mitigates both the Air Canada-
  style liability risk and the trust-erosion risk).

## 6. Retail/e-commerce specifics

- Retail sits at ~80% AI-in-support adoption, second only to telco/tech, and above the
  cross-industry average [S1] — Meridian would not be an early mover within its sector.
- WISMO and returns are repeatedly identified as the highest-volume, most automatable
  ticket categories for e-commerce specifically [S8], which is a favorable starting
  point given Meridian's business (physical goods, shipping-dependent, seasonal returns).
- No Meridian-specific or camping/hiking-retail-specific data was found; all figures
  above are cross-industry or general e-commerce. **(gap — flagged below)**

## Gaps — what we could not find

- No public data specific to outdoor/camping-gear retail or to a company of Meridian's
  approximate size (mid-size US e-commerce retailer). All figures are extrapolated from
  cross-industry or general e-commerce sources.
- No independent, audited case study of a mid-size (sub-enterprise) e-commerce retailer
  running a support-AI pilot with disclosed before/after numbers — the concrete named
  case study found (Klarna) is a large fintech, not an e-commerce retailer, and its
  numbers should not be used as a direct benchmark.
- No data was found on Meridian's own current support cost base, ticket volume, or
  staffing — required inputs for any ROI estimate specific to Meridian, and out of
  reach of public research. Flagged as a precondition for Stage 02 analysis to treat
  any dollar-figure projection as illustrative only.
- Vendor selection and detailed feature comparison were explicitly out of scope per
  `client-brief.md` and were not researched in depth; pricing structure only.

## Sources

See `output/sources.md` for the full source list with URLs and access dates.
