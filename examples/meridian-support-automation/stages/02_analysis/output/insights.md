<!-- stage: 02_analysis | run: 2026-07-12 | inputs: ../01_research/output/findings.md, ../01_research/output/sources.md, ../../shared/client-brief.md, ../../_config/conventions.md, references/analysis-framework.md -->

# Analysis: AI Agents for Customer Support at Meridian Outdoor Gear

Decision this informs: whether to fund a support-automation pilot next quarter.

## Insight 1: The winning move is narrow automation of one ticket type, not broad support automation

- Evidence: Retail already sits at ~80% AI-in-support adoption [S1], so Meridian is not
  early; but the credible deflection numbers (41% median, 59% top quartile) [S2][S3]
  and the repeated practitioner pattern of starting with WISMO/returns [S8][S15] both
  point to automating a narrow, high-volume, low-judgment workflow — not "customer
  support" broadly.
- Confidence: **high** — this is the one place where market data, vendor guidance, and
  risk-mitigation logic (see Insight 2) all converge independently.
- Confirmation or surprise: **confirmation** of the standard advice, but worth stating
  plainly because the client-brief question ("should we adopt AI agents") is phrased
  broadly — the evidence answers a narrower question than the one asked.
- Changes if: evidence emerged that Meridian's ticket mix is unusually concentrated in
  complex, judgment-heavy issues (e.g., product safety, warranty disputes) rather than
  WISMO/returns — currently unknown (gap, stage 01).

## Insight 2: The dominant risk is not technical failure — it's liability and trust erosion from an agent operating without a hard escalation boundary

- Evidence: *Moffatt v. Air Canada* establishes that a company is legally responsible
  for its chatbot's misstatements, not the vendor [S10][S11]; hallucination rates of
  3–27% are inherent even in guarded systems [S10]; three independent consumer surveys
  converge on majority preference for human support and real trust erosion from heavy
  AI reliance, including 53% who'd consider switching to a competitor over it [S12][S13][S14].
- Confidence: **high** — the legal precedent and three convergent surveys make this the
  best-supported risk in the evidence base, even though exact percentages vary by
  survey methodology.
- Confirmation or surprise: **surprise**, relative to how the question is often framed
  (cost/ROI-first). The evidence says the binding constraint on a Meridian pilot is
  trust and liability design, not whether the technology can hit a target deflection
  rate.
- Changes if: Meridian's own customers turn out to be meaningfully more AI-tolerant than
  the general population sampled in these surveys — untested, and worth building into
  the pilot's CSAT tracking rather than assumed away.

## Insight 3: Publicly reported ROI multiples are not a usable budget input for Meridian

- Evidence: ROI claims of 3.5–8x [S1] and 340% first-year ROI [S6] are directionally
  consistent (AI resolution is cheaper than human resolution by 3–10x per ticket
  [S1][S3]) but come from mixed methodologies and are not scaled to a mid-size retailer;
  the one named, quantified case study (Klarna, $40M/year avoided hiring cost) is a
  large fintech handling 2.3M conversations/month — a scale and business mismatch
  flagged explicitly in stage 01.
- Confidence: **medium** — the *direction* (AI resolution is materially cheaper per
  ticket) is well supported; the *magnitude* Meridian should expect is not.
- Confirmation or surprise: **confirmation** that automation is economically favorable
  in principle; **surprise** in how little of the published ROI data actually transfers
  to a business Meridian's size.
- Changes if: Meridian obtains even rough internal numbers (current cost per ticket,
  ticket volume) — at which point a Meridian-specific ROI estimate becomes possible
  and should replace these external multiples entirely.

## Insight 4: The evidence base cannot answer the ROI question without Meridian's own baseline data — so the first-quarter action should be measurement, not just deployment

- Evidence: Stage 01 found no data on Meridian's current support cost base, ticket
  volume, or staffing (gap, stage 01); every ROI and deflection figure above is
  cross-industry [S1][S2][S3][S6]. Without a baseline, Meridian cannot tell after a
  pilot whether it worked.
- Confidence: **high** — this isn't a market claim, it's a direct consequence of the
  documented research gap.
- Confirmation or surprise: **surprise** — the natural reading of the client's question
  is "should we buy a tool," but the evidence base implies the first real deliverable
  is internal data, which is cheap and has no vendor dependency.
- Changes if: Meridian already has this baseline data internally and simply didn't
  route it to this engagement — worth confirming before treating this as a gap.

## Insight 5: The high failure rate of agentic AI projects generally is a governance failure, not a technology failure, and is directly mitigated by the same narrow-scope pattern in Insight 1

- Evidence: Gartner projects over 40% of agentic AI projects will be canceled by 2027
  due to cost overruns, unclear business value, or inadequate risk controls [S5] — not
  due to the AI failing to work. The practitioner implementation pattern independently
  recommended (single workflow, replay against historical tickets, one channel,
  guaranteed escalation, named owner, metrics defined up front) [S8][S15] directly
  addresses each of those three failure causes.
- Confidence: **medium** — the causal link between "narrow scope + governance discipline"
  and lower cancellation risk is inferred from Gartner's stated cancellation reasons
  plus the separately-sourced implementation pattern, not from a study that measured
  cancellation rates against scope discipline directly.
- Confirmation or surprise: **confirmation** of general program-management wisdom,
  newly grounded in AI-specific failure data.
- Changes if: a future study ties agentic-AI project cancellation to causes unrelated to
  scope/governance (e.g., pure model capability limits) — would weaken this inference.

## Counter-case (steelman)

**The strongest argument against funding a pilot next quarter:** Meridian should not
commit budget yet. The evidence shows (a) over 40% of agentic AI projects are canceled
within about two years [S5]; (b) a majority of consumers across three independent
surveys prefer human support and would consider switching brands over heavy AI reliance
[S12][S13][S14]; (c) Meridian is not a laggard — retail is already at ~80% adoption
[S1], so a one-quarter delay costs little competitive ground; and (d) Meridian has no
internal baseline data (Insight 4), meaning any pilot funded today is really funding
data collection dressed up as automation. The more defensible use of next quarter's
budget is to build the internal baseline (ticket volume, cost, CSAT by category) and
revisit the funding decision once that data exists — spending nothing on vendor
contracts until the target workflow's actual volume and cost are known.

**Does the recommendation survive it?** Partially, and this is why the recommendations
below are scoped narrowly rather than as a full automation bet. A small, single-workflow
pilot with a hard human-escalation boundary (Insight 1, Insight 2) is cheap enough, and
short enough (evaluated at ~90 days), that it does not require the full baseline to be
safe to start — the pilot itself can generate the missing baseline data rather than
waiting for it. This only holds under one **assumption, not evidence**: that Meridian's
WISMO/returns ticket volume is large enough to make a 90-day pilot statistically
informative. That volume is unknown (gap, stage 01) and should be checked in week one,
before vendor commitment — if WISMO/returns volume turns out to be too low to generate
a meaningful signal, the counter-case wins and the recommendation should be to spend
the quarter on baseline-building only, as the counter-case argues.

## Sources

All citation tags above carry forward from `../01_research/output/sources.md`. No new
sources introduced at this stage, per `conventions.md`.
