<!-- stage: 03_report | run: 2026-07-12 | inputs: ../02_analysis/output/insights.md, ../02_analysis/output/recommendations.md, ../01_research/output/sources.md -->

# AI Agents for Customer Support: Should Meridian Fund a Pilot Next Quarter?

## Executive summary

**Yes — fund a narrow, single-workflow pilot next quarter, not a broad rollout.**

Automating order-status ("where is my order") and returns/exchange status queries, on
one channel, with a guaranteed path to a human for anything else, is the one place
where the market evidence, the risk evidence, and the cost evidence all agree. Retail
is already a leading adopter of this technology, so a scoped pilot doesn't put Meridian
ahead of or behind its peers — it puts Meridian on the same track most competitors are
already on.

The bigger risk isn't whether the technology works. It's what happens when it's wrong.
A Canadian tribunal has already held an airline liable for its chatbot's false
statements, and a majority of consumers across several 2026 surveys say they trust a
business less when it leans heavily on AI for support. Both risks are manageable with
one design choice: a hard, guaranteed handoff to a human for anything outside the
pilot's narrow scope.

Meridian has no internal data yet on its own support costs, ticket volumes, or
customer-satisfaction baseline — so the first quarter's real deliverable is proof, not
just automation: a pilot scoped tightly enough to be cheap and safe, evaluated against
metrics set before it launches, that tells Meridian whether a bigger investment is
justified.

## The question and scope

Meridian asked whether it should adopt AI agents for customer support, and if so, how
to start — informing whether to fund a support-automation pilot next quarter. In scope:
support-automation options, cost/benefit, risk, and an implementation path. Out of
scope: vendor selection and marketing automation. This report addresses the funding
decision; it does not recommend a specific vendor.

## What the evidence shows

**Narrow automation, not broad automation, is where the evidence converges.**
Retail already sits at roughly 80% adoption of AI in customer support, second only to
telco/tech [S1]. Reported deflection rates — the share of routine contacts an AI agent
resolves without a human — run around 41% on average and up to 59% at top-performing
programs [S2][S3]. Gartner, the primary industry analyst, projects agentic AI (AI
systems that plan and carry out multi-step actions on their own, not just suggest a
reply) will autonomously resolve 80% of common service issues by 2029 [S4]. But every
one of these figures, and the standard practitioner playbook for reaching them, points
to the same starting move: automate one high-volume, low-judgment workflow — for a
retailer, that's order-status and returns queries — before anything broader [S8][S15].
This is confirmation of familiar advice, but it matters because it answers a narrower
question than the one Meridian asked: the evidence supports automating *a* workflow,
not customer support broadly. *Confidence: high.*

**The real exposure is legal and reputational, not technical.** In a 2024 Canadian
tribunal case, Air Canada was held liable for its chatbot's incorrect statement of
company policy — the airline's argument that the bot was a separate entity was
rejected outright [S10][S11]. Even well-guarded systems hallucinate 3–27% of the time
[S10]. Separately, three independent 2026 consumer surveys converge on a majority
preference for human support, and 53% of respondents in one survey said they'd
consider switching to a competitor over heavy AI use in support [S12][S13][S14]. This
is a genuine surprise relative to how the question is usually framed — the binding
constraint on a pilot is not whether the AI performs well enough, it's whether Meridian
designs a guaranteed human escalation path from day one. *Confidence: high.*

**Published ROI figures are not a usable budget number for Meridian.** AI-resolved
tickets cost roughly 3–10x less than human-resolved ones [S1][S3], and reported ROI
ranges from 3.5–8x [S1] to a cited 340% first-year return [S6] — directionally
consistent, but not scaled to a retailer Meridian's size. The one concrete, quantified
case in the public evidence, Klarna's $40M/year in avoided hiring costs, is a large
fintech handling 2.3 million conversations a month — not a fair benchmark for Meridian
[S6]. The direction (automation is cheaper per ticket) is well supported; the magnitude
Meridian should expect is not, until Meridian has its own numbers. *Confidence: medium.*

**Meridian's own baseline data doesn't yet exist, which changes what "starting" means.**
No current data on Meridian's support cost, ticket volume, or CSAT was available to
this research. That means next quarter's real deliverable is measurement as much as
automation: a pilot narrow and short enough to double as the data-gathering exercise
Meridian is currently missing. *Confidence: high.*

## Recommendations

| # | Recommendation | Owner | First step | Main risk |
|---|---|---|---|---|
| 1 | Fund a narrow pilot on order-status and returns/exchange queries only, one channel, with a hard handoff to a human for anything else | Head of Customer Support (COO sponsor) | Confirm order-status/returns ticket volume from the last 90 days is large enough to make a pilot meaningful | Pressure to expand into judgment-heavy tickets before the narrow workflow is proven |
| 2 | Set deflection rate, CSAT change, escalation rate, and error-rate thresholds — and a 90-day continue/stop decision — before the pilot starts | COO, with Head of Customer Support | Draft the metrics and thresholds document before any vendor demo | Without pre-set thresholds, a pilot can become permanent regardless of performance |
| 3 | Pull Meridian's own cost-per-ticket, ticket volume, and CSAT baseline in parallel with vendor evaluation | Customer Support Operations, with Finance | Two-week internal data pull covering the last 90 days | Running this only after vendor selection would cost a full quarter |
| 4 | Have legal review AI-liability terms in any vendor contract, informed by the Air Canada precedent, and require no unsupervised answers on policy exceptions | Legal, with Head of Customer Support | Legal review of the liability clause in any shortlisted vendor's contract | Adds time to procurement — acceptable given the demonstrated legal exposure |
| 5 | Tell customers when they're talking to an AI agent, and guarantee a one-step path to a human at any time | CX/Support leadership, with Marketing | Draft disclosure and escalation-path language before launch | Low execution risk; skipping this is the fastest way to trigger the trust erosion in the evidence above |

## Counter-case and limitations

**The strongest argument against funding a pilot next quarter:** don't. More than 40%
of agentic AI projects are canceled within about two years [S5]. A majority of
consumers across three independent surveys prefer human support and would consider
switching brands over heavy AI reliance [S12][S13][S14]. Meridian is not behind its
peers — retail is already at roughly 80% adoption [S1] — so a one-quarter delay costs
little competitive ground. And with no internal baseline data yet, a pilot funded today
is effectively funding data collection dressed up as automation. On this view, the
better use of next quarter's budget is building the internal baseline first and
revisiting the funding decision once real numbers exist.

This recommendation survives that argument only partially, and only because of how
it's scoped: a single-workflow pilot with a hard human-escalation boundary is cheap and
short enough (evaluated at 90 days) to generate the missing baseline data itself,
rather than waiting for it. That depends on one unverified assumption — that Meridian's
order-status/returns ticket volume is large enough for a 90-day pilot to produce a
meaningful signal. Recommendation 1's first step checks that assumption before any
vendor commitment; if the volume is too low, the counter-case wins and the right move
is to spend the quarter on baseline-building only.

**Research limitations:** no data specific to outdoor/camping retail, or to a company
of Meridian's size, was found — all figures above are cross-industry or general
e-commerce estimates. No independent case study of a mid-size e-commerce retailer's
AI-support pilot with disclosed results was available. Vendor selection was out of
scope for this report and was not evaluated in detail.

## Sources

- [S1] "AI Customer Support 2026: 50+ Adoption + ROI Data Points" — Digital Applied, https://www.digitalapplied.com/blog/ai-customer-support-statistics-2026-adoption-roi-data (accessed 2026-07-12)
- [S2] "59 AI customer service statistics for 2026" — Zendesk, https://www.zendesk.com/blog/ai/productivity/ai-customer-service-statistics/ (accessed 2026-07-12)
- [S3] "30 AI Customer Service Statistics for 2026 (With Sources)" — Lorikeet, https://www.lorikeetcx.ai/articles/ai-customer-service-statistics (accessed 2026-07-12)
- [S4] "Gartner Predicts Agentic AI Will Autonomously Resolve 80% of Common Customer Service Issues Without Human Intervention by 2029" — Gartner, https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290 (accessed 2026-07-12)
- [S5] "Gartner Says Agentic AI Will Resolve 80% of Customer Service Issues by 2029. The Reality Is Far More Complicated." — Veribl, https://www.veribl.com/blog/gartner-agentic-ai-customer-service-2026 (accessed 2026-07-12)
- [S6] "AI Customer Service ROI: The Formula, Benchmarks, and a Worked Example for 2026" — MessageMind, https://messagemind.ai/blog/ai-customer-service-roi/ (accessed 2026-07-12)
- [S8] "13 AI Customer Service Best Practices for 2026" — Kustomer, https://www.kustomer.com/resources/blog/ai-customer-service-best-practices/ (accessed 2026-07-12)
- [S10] "What Air Canada Lost In 'Remarkable' Lying AI Chatbot Case" — Forbes, https://www.forbes.com/sites/marisagarcia/2024/02/19/what-air-canada-lost-in-remarkable-lying-ai-chatbot-case/ (accessed 2026-07-12)
- [S11] "Moffatt v. Air Canada: A Misrepresentation by an AI Chatbot" — McCarthy Tétrault, https://www.mccarthy.ca/en/insights/blogs/techlex/moffatt-v-air-canada-misrepresentation-ai-chatbot (accessed 2026-07-12)
- [S12] "AI Backlash Grows Across US, UK, and Canada: More Customers Reject Bots for Human Support in 2026" — PR Newswire / AnswerConnect, https://www.prnewswire.com/news-releases/ai-backlash-grows-across-us-uk-and-canada-more-customers-reject-bots-for-human-support-in-2026-302770476.html (accessed 2026-07-12)
- [S13] "Your customers aren't keen on that customer service chatbot you introduced – here's why" — IT Pro, https://www.itpro.com/technology/artificial-intelligence/your-customers-arent-keen-on-that-customer-service-chatbot-you-introduced-heres-why (accessed 2026-07-12)
- [S14] "Study reveals 71% of people prefer human agents for customer service" — Fox News, https://www.foxnews.com/tech/chatbots-losing-customer-trust-fast (accessed 2026-07-12)
- [S15] "The ultimate guide to AI for ecommerce customer service" — Ada, https://www.ada.cx/blog/the-ultimate-guide-to-ecommerce-customer-service/ (accessed 2026-07-12)
