# ICM Platform — MVP Spec

Productizing the ICM scaffold: a hosted (or client-hosted) service where clients run
ICM pipelines and approve review gates through a web UI, without touching a terminal.

**Status:** draft · **Owner:** Elroy Galbraith · **Last updated:** 2026-07-12

## Product thesis

The scaffold already works for an operator driving a coding agent. The product value is
the **review gate as a UI action**: clients see every intermediate output, edit it, and
approve before the next stage runs. Infrastructure (sandboxing, storage, RBAC, model
choice) exists to make that safe and deployable — it is not the differentiator.

**Riskiest assumption (validate first):** clients will actually review and approve gates
in a web UI rather than delegating everything back to the consultant. Test with one
design partner on the local docker-compose version before building hosted infra.

## Architecture (MVP)

```
                    ┌─────────────────────────────────────────┐
                    │  docker-compose (one deployable unit)    │
   browser ──HTTPS──▶  web app (UI + API + auth)              │
                    │       │                                  │
                    │       ▼ run stage / approve gate         │
                    │  runner container (per workspace)        │
                    │   · agent loop (Agent SDK / OpenRouter)  │
                    │   · FS jailed to workspace folder        │
                    │   · outbound web: allowlist only         │
                    │       │                                  │
                    │       ▼ read/write                       │
                    │  workspace volume  ── git (audit trail)  │
                    │       │                                  │
                    └───────┼──────────────────────────────────┘
                            ▼ sync
                  S3-compatible bucket
                  (MinIO local · S3/R2 hosted — same code path)
```

One docker-compose file is the whole product. "Hosted vs on-prem" is a deploy choice,
not two products: the consultant runs it on a VPS, or the client runs it inside their
network. Same images, same config surface.

## MVP requirements

### 1. Runtime & sandboxing
- One runner container per workspace executing the agent loop.
- Filesystem access jailed to the workspace folder (container mount is the jail —
  no Firecracker/E2B until multi-tenant hosting).
- One run at a time per workspace (lock file). Concurrent runs are v2.
- Per-run token budget cap; run aborts cleanly and reports spend when hit.

### 2. State & storage
- Workspace = the ICM folder, on a named volume.
- Git commit at every stage completion and every human edit → the audit trail.
- Sync to S3-compatible storage: MinIO (local deploy) or S3/R2 (hosted).
  Single storage interface; backend is config.

### 3. Auth (not RBAC)
- Two roles, scoped per workspace:
  - **Operator** — run stages, edit `_config/`, `shared/`, contracts.
  - **Reviewer** — view outputs, edit outputs, approve/reject gates.
- Email + password or magic link. SSO/OIDC deferred.

### 4. Web UI (the real MVP work)
- Workspace view: pipeline diagram with stage status (pending / running / awaiting review / approved).
- Markdown viewer/editor for any output or config file.
- "Run stage N" button (operator) and approve / reject-with-comment gate (reviewer).
- Run log per stage: files read (contract Inputs), files written, tokens spent.
- Diff view against previous git commit for every file.

### 5. Models
- OpenRouter as the single model gateway (one env var per deploy for the key).
- **2–3 vetted models only**, not open choice: agentic file-tool loops degrade badly on
  weak models, and "any model" becomes a support burden. Vet per release.
- Model pinned per workspace, recorded in run metadata for reproducibility.

### 6. Guardrails
- Outbound network from the runner: domain allowlist (research stages fetch untrusted
  web content — prompt injection is the primary threat).
- Injected system rules the workspace can't override: never write outside the workspace,
  never exfiltrate env/secrets, stop at gates.
- All runs logged: prompt, files touched, tool calls, cost.

## Explicitly deferred (v2+)

- Multi-tenancy and org management (MVP: one deploy per client)
- Full RBAC, SSO/OIDC, audit-log export
- Concurrent runs and pipeline branching
- Workspace-builder-as-a-service (paper §4: questionnaire → generated workspace)
- Usage metering / billing
- Firecracker-class isolation (needed only when strangers share a host)
- Open-ended model selection

## Build estimate

4–6 weeks solo: ~1 week runtime + storage plumbing, 2–3 weeks web UI, ~1 week
guardrails/polish. Then a design-partner engagement on the compose stack before any
hosted-infra spend.

## Validation milestones

1. **M0 — dogfood:** run a real client engagement through the UI yourself.
2. **M1 — design partner:** one client's reviewer approves gates themselves, unprompted,
   for a full pipeline. This validates the thesis.
3. **M2 — deploy split:** same compose file running both on your VPS and inside one
   client's network. This validates the hosting story.

Only after M1–M2 do sandbox hardening, RBAC, and multi-tenancy earn their build cost.
