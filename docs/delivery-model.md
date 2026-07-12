# Delivery Model

How an engagement runs, end to end. Companion to `mvp-spec.md` (the platform) and
`use-cases.md` (the markets).

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

## The offer

Three revenue lines, one loop:

| Line | What it is | Pricing shape |
|---|---|---|
| Platform | Hosted or on-prem deploy (see `mvp-spec.md`) | Subscription |
| Configured workspace | Discovery + generated pipeline encoding the client's process | Engagement fee |
| Script verification & accompaniment | Review of deterministic scripts + guided first-N cases | Engagement fee (billable, not overhead) |

## The engagement loop

### 1. Onboarding (discovery)

Client answers the setup questionnaire in the UI. The agent interviews rather than
form-fills — the goal is finding the natural stage breakpoints in their existing
workflow and the approvals that exist only in someone's inbox.

**Reality check:** clients describe their workflow wrong the first time. The
questionnaire gets ~70%; the first live case reveals the rest. Price accordingly —
setup + first-N-cases accompaniment, never setup alone.

### 2. Generation (the workspace-builder)

The agent scaffolds the client workspace: numbered stage folders, CONTEXT.md contracts,
reference guides seeded from questionnaire answers, routing table, and draft scripts
for the mechanical steps. (This is the paper's third reference implementation,
productized.)

**Script promotion gate — the weak link, handled explicitly.** A wrong contract
produces a bad draft a human catches at a gate. A wrong script produces a plausible,
correct-looking number — exactly what gates are bad at catching. Therefore:

- Every generated script ships with unit tests and a fixture dataset.
- Scripts start in `draft` status; a human reviewer promotes them to `trusted` after
  review, recorded in git.
- Untrusted scripts may run, but their outputs are labeled `(unverified computation)`
  in stage outputs until promoted.

### 3. First case (validation + training)

The client runs a real case through the UI with the consultant guiding. Gates are
approved by the client's own reviewers from day one — this validates the core thesis
(M1 in `mvp-spec.md`) and trains their team simultaneously.

### 4. Iteration (convergence)

Client edits at gates are diagnostic signals. Over the first few cases the workspace
converges on their actual process via the improvement loop below.

## The improvement loop (self-tuning, gated)

The paper's edit-source principle: recurring output edits mean the *source* (contract,
voice guide, reference) is wrong — "editing the output is patching the binary."
The platform operationalizes this:

1. **Detect:** the agent tracks human edits at gates across runs (git diffs make this
   free). Recurring patterns — same section rewritten, same figure corrected, same
   tone fix — are flagged.
2. **Propose:** the agent drafts a diff to the responsible source file (stage contract,
   `voice.md`, reference guide, or script) with the evidence: "in 4 of the last 5 runs,
   the reviewer shortened the executive summary — proposed contract change attached."
3. **Approve:** an operator reviews and accepts/rejects the diff in the UI. Accepted
   changes are ordinary git commits — attributable, revertible, auditable.

**The rule that keeps this sellable in a risk context: the agent never modifies its own
instructions silently.** Instruction changes go through the same gate mechanism as
pipeline outputs. This is "self-improving," not "self-modifying" — the distinction is
the entire compliance story. A silently self-rewriting workflow is unauditable by
definition; a propose-diff-approve loop is just change management, done properly.

Same applies to scripts: proposed script changes re-enter `draft` status and must be
re-promoted, with tests passing.

## Why this loop compounds

- Each accepted diff makes the next run need fewer edits — the workspace converges
  on the client's process and stays converged as the process drifts.
- The consultant's accompaniment naturally tapers (case 1: heavy; case 5: gate
  approvals only) while the subscription persists.
- The converged workspace is the client's captured process — high switching cost,
  and the strongest renewal argument: "your last 20 cases of refinements live here."
