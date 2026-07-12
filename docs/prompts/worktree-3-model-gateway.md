# Worktree 3 Prompt: Model Gateway, Web Tool, Script Tool

Copy-paste to a coding agent in a fresh worktree branched from main.

---

Read first, in order: `contracts/README.md` and everything in `contracts/` (READ-ONLY —
if your implementation doesn't fit a contract, stop and ask; never modify contracts),
`docs/mvp-spec.md` (§5 Models, §6 Guardrails), `docs/use-cases.md` (the script/LLM
determinism split), and the interface definitions in
`docs/superpowers/plans/2026-07-12-runtime-storage-core.md` (Tasks 4, 5, 8, 9 — your
modules must match its conventions: `ToolDef`, `ToolResult`, `ToolCallLogEntry` shapes,
vitest, TDD with failing tests first, one commit per module).

**Critical constraint:** the runtime-core plan is being executed in a PARALLEL worktree.
Do NOT create or modify any file that plan owns (`platform/runner/src/{jail,lock,
tokenBudget,runLog,state,git,openrouter,tools,agentLoop,cli}.ts`, its tests, or
`package.json` beyond adding devDependencies if strictly needed). You build NEW modules
plus their tests only. Integration wiring is documented, not applied.

## Module 1: `platform/runner/src/config.ts`

Per-workspace runner configuration, loaded from `<workspace>/runner.config.json`
(committed to the workspace — it's part of the reproducibility story).

- `interface RunnerConfig { model: string; tokenBudget: number; allowedDomains: string[] }`
- `loadConfig(workspaceRoot: string): RunnerConfig` — missing file returns defaults
  (`anthropic/claude-sonnet-5`, 200_000, `[]`); partial file merges over defaults;
  invalid values throw `ConfigError` with a message naming the bad field.
- `const VETTED_MODELS: string[]` — exactly: `anthropic/claude-sonnet-5`,
  `anthropic/claude-opus-4.8`, `openai/gpt-5.2`. A configured model outside this list
  throws `ConfigError` (mvp-spec §5: vetted models only, no open choice).

## Module 2: `platform/runner/src/webTool.ts`

A `fetch_url` tool for research stages, matching the runtime-core tool conventions.

- `const FETCH_URL_DEF: ToolDef` — name `fetch_url`, params `{ url: string }`.
- `fetchUrl(url: string, allowedDomains: string[]): Promise<{ ok: boolean; content: string }>`
- Enforcement (mvp-spec §6 — this is the outbound allowlist, the primary prompt-injection
  defense, so no shortcuts):
  - https only; reject http, file, and anything else.
  - Host must exactly match an allowed domain or be a subdomain of one
    (`docs.example.com` matches `example.com`; `notexample.com` does not).
  - Empty allowlist = all fetches refused with a message telling the model the domain
    is not allowlisted.
  - Re-check the allowlist on every redirect hop (use `redirect: 'manual'`, max 5 hops).
  - Refuse URLs whose host resolves to private/loopback ranges (SSRF guard); simplest:
    reject IP-literal hosts outright, and document DNS-rebinding as a known v2 gap.
  - 30s timeout, 500KB response cap (truncate with a marker), strip HTML to readable
    text (tags removed is sufficient; no heavy dependency).
- Tests: mock fetch (vitest `vi.stubGlobal`) — allowlisted fetch succeeds; non-listed
  domain refused; subdomain logic both ways; redirect to non-listed domain refused;
  http refused; truncation at cap.

## Module 3: `platform/runner/src/scriptTool.ts`

A `run_script` tool so stages can execute their deterministic scripts (the
script/LLM split in `docs/use-cases.md`).

- `const RUN_SCRIPT_DEF: ToolDef` — name `run_script`, params
  `{ script: string; args?: string[] }` where `script` is a workspace-relative path.
- `runScript(workspaceRoot: string, script: string, args: string[]): { ok: boolean; content: string }`
- Rules:
  - Script path must resolve inside the workspace — reimplement the same
    realpath-containment check the runtime-core `jail.ts` uses (do not import it;
    that file doesn't exist in this worktree — mirror it and note in INTEGRATION.md
    that the duplicate should collapse into one import after merge).
  - Script must live under a stage's `scripts/` directory (`stages/*/scripts/`) —
    anything else is refused. This is the promotion boundary from
    `docs/delivery-model.md`.
  - Execute with `execFileSync` (never a shell string), interpreter chosen by
    extension: `.py` → `python3`, `.js`/`.mjs` → `node`, anything else refused.
  - cwd = workspace root, 60s timeout, env stripped to `PATH` only (no API keys leak
    into scripts), stdout+stderr captured, 100KB output cap.
  - Non-zero exit → `ok: false` with captured output.
- Tests: fixture scripts under `test/fixtures/` — happy path (py and js), script
  outside `scripts/` refused, path escape refused, non-zero exit reported, env does
  not contain `OPENROUTER_API_KEY`, timeout kills a sleeping script.

## Deliverable 4: `platform/runner/INTEGRATION.md`

Exact wiring to apply AFTER the runtime-core worktree merges (do not apply here):

- Add `FETCH_URL_DEF`/`RUN_SCRIPT_DEF` to `TOOL_DEFS` and their executors to the
  `runTool` switch in `tools.ts` (show the exact diff hunks).
- Plumb `loadConfig` into `commands/run.ts`: config's model/tokenBudget/allowedDomains
  flow into `runAgentLoop`; record the configured model in the run log (already
  supported by the `RunLog.model` field).
- Collapse the duplicated jail check into a single import.
- Note: `fetch_url` and `run_script` need `ToolCallLogEntry.tool` union extended with
  both names.

## Deliverable 5: contract proposal (draft, needs human approval)

Write `contracts/proposals/runner-config.schema.json` (JSON Schema for
`runner.config.json`, mirroring Module 1). Contracts are read-only — putting it in
`contracts/proposals/` flags it for human review; do NOT place it in
`contracts/schemas/`.

## Definition of done

- `npm run typecheck && npm test` green with only your new files added — zero
  modifications to runtime-core-owned files (`git diff --stat` against the branch
  point proves it).
- INTEGRATION.md contains applyable diff hunks, not prose descriptions.
- Every module committed separately with tests, TDD order (failing test commit
  optional, but tests must exist and pass).
