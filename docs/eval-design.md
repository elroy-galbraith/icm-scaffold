# Evaluation Design — ICM vs Monolithic Prompting

Goal: an honest answer to three questions. **When is ICM better? When does it fail? When does it merely match?** The paper (arXiv:2603.16021) admits no controlled comparison exists. This protocol is that comparison — designed so a negative result is still publishable and still useful.

Honesty requirements (non-negotiable):

- Pre-register hypotheses, metrics, and decision thresholds in this file **before** the first scored run. Git history is the timestamp.
- Every run is logged (`.runner/runs/`) and every run counts. No dropping "bad" runs.
- The monolithic baseline gets a fair shot: same model, same information, same tools, same total token budget. If the baseline is straw-manned, the result is worthless internally and embarrassing externally.
- Publish the failure taxonomy alongside the wins.

## 1. Hypotheses (pre-registered)

| ID | Hypothesis | Falsifiable prediction |
|---|---|---|
| H1 | Staged loading improves citation integrity | ICM final reports have higher verified-citation rate and lower orphan-claim rate than monolithic |
| H2 | Staged loading improves output structure compliance | ICM outputs violate fewer conventions.md rules (metadata block, `[Sn]` format, file contracts) |
| H3 | ICM costs more tokens/time on small tasks | On short tasks, ICM overhead (3 stage boots) exceeds monolithic cost with no quality gain — an expected **loss** region |
| H4 | ICM loses information across stage boundaries on tasks needing late access to early raw material | Contract-miss failures appear in ICM but not monolithic — an expected **failure mode** |
| H5 | Human gates catch errors cheaply | In the human-gated arm, edit volume at gates predicts (and removes) errors that survive to final output in auto-approved runs |
| H6 | ICM is more robust to weaker models | Quality gap between strong and mid-tier model is smaller under ICM than monolithic |

H3 and H4 are deliberate: an honest eval predicts its own losses.

## 2. Arms

| Arm | Description | Gates |
|---|---|---|
| **A: ICM** | Runner executes stages 01→02→03 per CONTEXT.md contracts, staged loading | Auto-approve |
| **B: Monolithic** | Single agent run. Prompt = concatenation of CLAUDE.md + root CONTEXT.md + all three stage contracts + `_config/*` + `shared/*` + all `references/*`. Same tools (fetch_url, run_script, read/write). One output: the final report | None (no gates exist) |
| **C: ICM + human** | Same as A, but Elroy (later: a second reviewer) actually reviews at each gate, edits allowed, edits diffed and timed | Real |

Fairness rules for Arm B:

- **Same information.** Everything ICM can ever load is in the monolithic prompt. Nothing ICM-only, nothing withheld.
- **Same total budget.** Arm B's token budget = sum of Arm A's three stage budgets. Same model, same temperature, same `VETTED_MODELS` slug.
- **Same output contract.** Arm B is told to produce the identical final deliverable (report file with metadata block, `[Sn]` citations, Sources section). It is judged on the same rubric.
- **Best-effort baseline.** Before scoring begins, spend up to 3 iterations improving the monolithic prompt on a dev task (not in the test set). A weak baseline is the classic way these ablations lie.

Arm C runs on a subset (golden engagements only) because human time is the scarce resource. It answers H5; A vs B answers H1–H4, H6.

## 3. Task sets

### 3.1 Golden engagements (internal, n = 8–10) — gated on legal

Tasks from the two commercial contexts, frozen with inputs and a reference "known-good" outcome. **Phased for legal exposure:**

- **Phase 1 — synthetic-from-real** (after legal approves the *derivation method*, once): 5–6 RBF deal-memo tasks fabricated by transforming real deals (renamed parties, perturbed figures, recombined structures). Note the limitation: synthetic tasks validate architecture (citations, structure, cost, failure modes) but the "ground-truth memo" is also fabricated, so match-vs-shipped-memo claims are weak here.
- **Phase 2 — real anonymized deals** (after legal approves inputs *and* outputs): needed only for the internal pitch numbers (time-to-memo vs actuals, gate catch rate against real errors). Arm C runs here.
- 2–3 consultancy-style research reports (JSE/JMEA-flavored topics, public sources) — low legal exposure, can run in Phase 1.
- 1 Meridian worked example (already in `examples/`) as the pipeline smoke test — excluded from scoring.

Freeze each task as `eval/tasks/<id>/`: brief, inputs, allowed sources snapshot (cache fetched pages so both arms see identical source text — this also makes citation verification deterministic), and rubric notes.

### 3.2 DRBench track (external, n = 20 sampled tasks)

Run a fixed random sample of 20 DeepResearch Bench tasks (seeded sample, listed in this repo before running) through both arms. Score with:

- **FACT**-style citation accuracy (statement–URL support rate) — directly comparable to published numbers for OpenAI Deep Research, Gemini, Claude-with-search.
- **RACE**-style quality rubric via LLM judge (see §5).

Caveat, stated up front in any external use: published DRBench baselines were produced by full products with their own search stacks; our numbers are comparable in *metric*, not in *harness*. The clean claim is Arm A vs Arm B on identical harness; the DRBench numbers are context, not head-to-head victory claims.

### 3.3 Failure probes (adversarial, n = 6–8)

Tasks designed to find ICM's breaking points. Written *to make ICM lose* where the architecture predicts it should:

| Probe | Targets | Expected |
|---|---|---|
| Tiny task ("2-page summary of one document") | H3 | ICM overhead, no quality gain |
| Late-dependency task (report needs a detail the research contract wouldn't capture) | H4 | ICM contract miss; monolithic retains it |
| Backtracking task (analysis invalidates a research assumption mid-way) | H4 | ICM can't revisit stage 01 without a human |
| Contradictory-sources task | H1 | Tests whether staging helps or hides the contradiction |
| Out-of-routing-table request | routing | Does the agent improvise or fail loudly? Loud failure = pass |
| Malformed upstream output (inject a broken findings.md) | robustness | Does stage 02 detect or propagate garbage? |

## 4. Metrics

All computable from artifacts already produced (RunLog JSON, output files, cached sources), except judge scores.

| Metric | Definition | Source | Auto? |
|---|---|---|---|
| Verified-citation rate | % of `[Sn]`-cited claims where the cached source supports the claim | output files + `eval/sources/` cache; LLM verifier + 20% human spot-check | Semi |
| Citation hallucination rate | % of Sources entries that don't exist / don't contain claimed content | same | Semi |
| Orphan-claim rate | % of factual claims with no `[Sn]` and no `(assumption)`/`(analyst judgment)` label | regex + LLM claim extractor | Semi |
| Convention compliance | metadata block present, H1 rule, Sources format, filenames per contract | script | Yes |
| Citation survival | % of stage-01 `[Sn]` tags still correctly attached in final report (Arm A); N/A for B — report separately, don't use in A-vs-B comparison | script | Yes |
| Report quality | Pairwise blinded judge, RACE-derived rubric (comprehensiveness, insight, instruction-following, readability) | judge protocol §5 | Semi |
| Tokens | `tokensSpent` summed over stages (A/C) vs single run (B) | RunLog | Yes |
| Wall time | `endedAt − startedAt` summed | RunLog | Yes |
| Run failures | `aborted_budget` / `error` rates, tool-call error rates | RunLog | Yes |
| Human edit volume (Arm C) | diff lines per gate + minutes per gate | git diff at gates + timer | Yes |
| Gate catch rate (Arm C) | % of errors present at gate N absent from final; matched against errors surviving in Arm A on same task | manual coding | No |

## 5. Judging protocol

- **Pairwise, blinded, position-swapped.** Judge sees the task brief and two anonymized reports (A/B order randomized, each pair judged twice with order swapped; disagreement between swaps = tie).
- **Judge model from a different family** than the generator (if generating with Claude, judge with GPT/Gemini, and vice versa) to reduce self-preference bias. Two judge models; report agreement.
- **Human adjudication** on a 20% sample and on all judge disagreements. If human–judge agreement < 70%, judge scores are demoted to secondary evidence.
- Judges never see tokens, time, arm labels, or file structure — quality judgment must be uncontaminated by cost.

## 6. Statistics and decision rules

- **Paired design**: every task runs in both arms, 3 repetitions each (temperature/seed variation), same model. Primary model: current default from `VETTED_MODELS`; repeat the full grid on one mid-tier model for H6.
- **Tests**: Wilcoxon signed-rank on per-task means; report bootstrap 95% CIs on deltas and effect sizes. With n≈30 scored tasks, detectable effects are moderate — say so rather than overclaiming.
- **Pre-registered verdicts** per metric:
  - **ICM better**: CI on delta excludes 0 in ICM's favor and |delta| exceeds the floor (citation accuracy +5pp; orphan rate −5pp; quality win-rate > 60%).
  - **Match**: CI within ±floor. A match on quality at equal cost is a *finding*, not a failure — it means the value is auditability and gates, and the pitch changes accordingly.
  - **ICM worse / fails**: CI excludes 0 against ICM, or a probe reproduces a failure ≥ 2 of 3 repetitions. Goes in the failure taxonomy with a mitigation note.
- Report **cost-adjusted quality** as the headline table: quality metrics alongside tokens and wall time, per task class (small / standard / complex). The expected honest result is a frontier, not a sweep.

## 7. Failure taxonomy

Every ICM loss or probe failure is coded into exactly one:

1. **Routing error** — agent picked the wrong stage/contract.
2. **Contract miss** — stage contract didn't request information a later stage needed (H4).
3. **Boundary loss** — information existed in stage N output but was dropped/distorted by stage N+1.
4. **Overhead loss** — quality tie but ICM cost materially higher (H3).
5. **Convention breakage** — output violated conventions.md despite contract citing it.
6. **Runner fault** — budget abort, tool error, lock issue (engineering bug, not architecture evidence; fix and rerun).

Each category gets: frequency, example run ID, and whether the mitigation is *edit the contract* (cheap, on-message — "fix the source, not the output") or *architectural* (expensive, honest limitation).

## 8. Implementation plan

```
eval/
  tasks/<task-id>/          brief.md, inputs/, sources/ (cached), rubric.md
  arms/monolithic-prompt.md the frozen Arm B prompt (built by concat script)
  scripts/
    build_monolithic.py     concat per §2 fairness rules
    run_matrix.py           task × arm × rep × model → runner invocations
    score_conventions.py    metric rows: compliance, survival, tokens, time
    extract_claims.py       claim/citation extraction for verification
    verify_citations.py     claim vs cached source (LLM verifier)
    judge_pairwise.py       §5 protocol
  results/
    runs.csv                one row per run, joined from RunLog JSONs
    verdicts.md             pre-registered thresholds → outcomes
```

Runner needs two small additions: an `--auto-approve-gates` flag and a `--seed`/temperature override recorded in RunLog. Everything else exists.

Order of work (DRBench-first — no legal dependency until step 4):

1. Freeze failure probes + the DRBench sample; cache sources. Run Meridian smoke test through both arms. Build and tune Arm B prompt on a dev task; freeze it.
2. Run the A-vs-B matrix on DRBench + probes. Code failures (§7). This alone answers H1–H4 and produces the externally comparable citation numbers.
3. In parallel: get legal signoff on the synthetic-derivation method (§3.1 Phase 1).
4. Build synthetic golden engagements; run A-vs-B on them.
5. Arm C (human gates) — Phase 2 real deals if cleared, else synthetic.
6. Write `results/verdicts.md` against the pre-registered thresholds. No edits to §1 or §6 after step 2 begins — additions only, clearly dated.

## 9. What this buys

- **Internal**: a quality gate for every workspace change (rerun the matrix = regression test for prompt edits).
- **Commercial**: the citation-accuracy number vs the published 11–57% hallucination range, honestly caveated.
- **Public**: the ablation the source paper says doesn't exist. Publishing it — including the loss regions — is the credibility play; a sweep-claim would be correctly disbelieved.

## Sources

- [S1] DeepResearch Bench (RACE + FACT) — https://arxiv.org/pdf/2506.11763 (accessed 2026-07-12)
- [S2] Cited but Not Verified — source attribution study — https://arxiv.org/html/2605.06635v1 (accessed 2026-07-12)
- [S3] Detecting and Correcting Reference Hallucinations — https://arxiv.org/pdf/2604.03173 (accessed 2026-07-12)
- [S4] Van Clief & McDermott, Interpretable Context Methodology — https://arxiv.org/abs/2603.16021 (accessed 2026-07-12)
