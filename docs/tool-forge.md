# Tool Forge & Skill Library (design note — v2, not MVP)

How the platform lets the system design, build, and test its own tools and reusable
skills — with human review — and what must exist before that's safe.
Companion to `delivery-model.md` (promotion gate) and `mvp-spec.md` (deferred list).

**Status:** concept · **Sequence:** after M1 validation · **Owner:** Elroy Galbraith

## Skills vs ICM workspaces (positioning)

| | Skill | ICM workspace |
|---|---|---|
| Nature | Capability — portable know-how | Process — a stateful engagement |
| State | Stateless, reusable anywhere | One per engagement; stages, gates, audit trail |
| Answers | "How do I do this kind of task well?" | "Where are we, and who approved what?" |
| Analog here | Layer 3 references (`voice.md`, `analysis-framework.md`) | The whole workspace |

They're complementary: skills slot into ICM as Layer 3; ICM adds orchestration,
state, and audit — the parts buyers in regulated contexts pay for. A stage contract's
Inputs table is, in effect, skill invocation.

## Gap today

- **Reference reuse is copy-paste.** Duplicating a workspace copies its Layer 3; a fix
  in one copy doesn't propagate. No shared, versioned library.
- **Tools are fixed.** The runner ships read/write/list/finish (+ `fetch_url`,
  `run_script` from the model-gateway worktree). Stage scripts are the extension
  point, but nothing manages their lifecycle.

## The forge: a meta-pipeline (same shape as the paper's workspace-builder)

An ICM workspace whose product is a tool:

| Stage | Job | Gate |
|---|---|---|
| `01_specify` | Plain-language capability description → spec: inputs, outputs, edge cases, fixture examples | Requester confirms spec |
| `02_implement` | Spec → script + unit tests + fixture dataset | — |
| `03_verify` | Run tests against fixtures; produce human-readable results table ("input X → output Y, expected Y ✓") | — |
| `04_promote` | Package for the library with metadata (owner, version, spec link, test results) | **Reviewer promotes to `trusted`** |

The `03_verify` output is the key design move for non-technical users: they review
"does this test output look right?" — a judgment they can actually make — rather than
"is this code correct?", which they can't. The consultant reviews the code itself for
risk-adjacent tools (billable, per `delivery-model.md`).

## Promotion must be enforced in code, not prose

Self-generated tools are the sharpest edge in the system: generated code producing
plausible numbers is the failure mode review gates are worst at catching. Therefore:

- Each workspace (or the shared library) carries a `tools.manifest.json`:
  `{ path, status: draft|trusted, version, promotedBy, promotedAt, testCommand }`.
- The **runner** refuses `run_script` on a script absent from the manifest or marked
  `draft` — or runs it with all downstream outputs force-labeled
  `(unverified computation)`. Runner-enforced, never convention.
- Any modification to a `trusted` script (git diff detects it) demotes it to `draft`
  automatically; re-promotion requires tests passing + human sign-off.
- Promotion events are git commits: who, what, when — same audit story as everything
  else.

## Shared library (skills + tools)

A versioned repo (`library/`) that workspaces reference rather than copy:

- `library/skills/<name>/` — Layer 3 reference bundles (voice guides, frameworks,
  domain guides) with a small metadata header.
- `library/tools/<name>/` — promoted scripts + tests + manifest entries.
- Workspaces pin a library version in `runner.config.json`; the workspace-builder and
  forge both publish into it through the promotion gate.
- Propagation becomes a version bump reviewed at a gate, not a manual copy.

## Why this is v2

Prerequisites that must exist and survive real use first: the runner (runtime-core),
`run_script` + allowlisted `fetch_url` (model-gateway worktree), the manifest
enforcement above, and M1 validation (a real client approving gates). Building the
forge before the promotion gate is enforced in code would ship the system's most
dangerous failure mode first.

## The commercial frame

The forge turns the platform from "workflows we configure for you" into "a system your
own team extends safely" — the non-technical-user finding from the paper
(§4: three zero-code members built working pipelines) extended from workspaces to
tools. Every promoted tool is client-owned process capital living in their library —
the same switching-cost/renewal argument as the converged workspace, compounding.
