# icm-runner-integration report

## Task

Wire the model-gateway additions (`config.ts`, `webTool.ts`, `scriptTool.ts`) into the
runtime core of `platform/runner/`, per `INTEGRATION.md` (adapted to current file content,
which had drifted from the doc's snapshot), then add HTML-entity decoding and webTool
edge-case tests, run verification, delete `INTEGRATION.md`, and commit.

Contract precondition verified: `git log --oneline | grep bdaa3eb` → present
(`bdaa3eb Contracts (human-approved): extend run-log tool enum with fetch_url/run_script; promote runner-config schema from proposals`).
`contracts/schemas/run-log.schema.json` already has `"fetch_url"`/`"run_script"` in the
`toolCalls[].tool` enum. `contracts/` was not touched.

## Changes per numbered item

### 1. `platform/runner/src/runLog.ts`
Extended `ToolCallLogEntry.tool` union to include `'fetch_url' | 'run_script'`. One-line change.

### 2. `platform/runner/src/tools.ts`
- Imported `FETCH_URL_DEF, fetchUrl` from `./webTool.js` and `RUN_SCRIPT_DEF, runScript` from `./scriptTool.js`.
- Appended `FETCH_URL_DEF, RUN_SCRIPT_DEF` to `TOOL_DEFS`.
- Added `allowedDomains: string[]` to `ToolContext`.
- `createToolContext(workspaceRoot, allowedDomains: string[] = [])` now returns `allowedDomains` in the context (default keeps old 1-arg callers working — verified via `test/tools.test.ts`'s unchanged `createToolContext(workspaceRoot)` calls, which still pass).
- `executeTool` and `runTool` are now `async` / return `Promise<...>`, with `await runTool(...)` inside `executeTool`.
- Added `case 'fetch_url'` and `case 'run_script'` branches exactly as specified in the task (call `fetchUrl`/`runScript`, throw on `!result.ok` so the existing try/catch in `executeTool` logs it as a tool-call error).

### 3. `platform/runner/src/agentLoop.ts`
Read current file first (already had `maxTokens`/`DEFAULT_MAX_TOKENS` and the truncated-tool-call-JSON try/catch from a later fix, not reflected in `INTEGRATION.md`). Applied only the three deltas needed on top of that:
- Added `allowedDomains?: string[]` to `AgentLoopParams`.
- `createToolContext(params.workspaceRoot)` → `createToolContext(params.workspaceRoot, params.allowedDomains ?? [])`.
- Inside the existing try block, after `JSON.parse` succeeds: `const result = executeTool(...)` → `const result = await executeTool(...)`. Left the JSON-parse-failure branch (which never calls `executeTool`) untouched.

### 4. `platform/runner/src/commands/run.ts`
Read current file first (already had `checkStageOrder`/`force`/`StageOrderBlockedError`, not reflected in `INTEGRATION.md`). Applied:
- Imported `loadConfig` from `../config.js`.
- Added `const config = loadConfig(workspaceRoot);` right after the `OPENROUTER_API_KEY` check and before the `checkStageOrder` block, so a broken `runner.config.json` fails fast before any lock/stage-order work — matches the instruction ("before doing any lock/stage-order work").
- Added `model: config.model, tokenBudget: config.tokenBudget, allowedDomains: config.allowedDomains,` to the `runAgentLoop({...})` call, alongside the existing `workspaceRoot, stage, apiKey, chatCompletionFn: deps.chatCompletionFn`.

### 5. `platform/runner/src/scriptTool.ts`
Deleted the duplicated `JailViolationError` class, `resolveInJail`, `assertInside`, `nearestRealPath` (and their explanatory "Mirrors platform/runner/src/jail.ts..." comment). Replaced with `import { resolveInJail } from './jail.js';`. Did **not** import `JailViolationError` from `jail.js` — verified via grep that nothing in `scriptTool.ts` or any file importing from `scriptTool.ts` (only `test/scriptTool.test.ts`, which imports `runScript`/`runScriptWithTimeout`/`RUN_SCRIPT_DEF`) references it by name; `runScriptWithTimeout`'s catch block only does `err instanceof Error`, not a name check.

Import cleanup at the top: removed `existsSync`, `dirname`, `resolve`, `isAbsolute` (only used by the deleted functions); kept `realpathSync` (still used directly in `runScriptWithTimeout`) and `relative`, `extname` (still used by `isUnderStageScriptsDir`/`interpreterFor`). Confirmed via `tsc --noEmit` — no unused-import errors, no missing-import errors.

Replaced the local `export interface ToolDef {...}` with `import type { ToolDef } from './openrouter.js';`.

### 6. `platform/runner/src/webTool.ts`
Replaced the local `export interface ToolDef {...}` with `import type { ToolDef } from './openrouter.js';`.

## Cascading change: `test/tools.test.ts`

`grep -n executeTool test/tools.test.ts` found **6** call sites (not 5 — the first `it` block has two calls: `write_file` then `read_file`) across **5** `it` blocks. All 5 `it` callbacks converted to `async () => {...}` and all 6 `executeTool(...)` calls converted to `await executeTool(...)`. `createToolContext` calls left as-is (1-arg, default `allowedDomains` applies). Verified no other test file references `executeTool`/`createToolContext` (`grep -rn "executeTool\|createToolContext" test/*.ts` outside `tools.test.ts` → no matches).

## Follow-up work

### A. HTML entity decoding in `webTool.ts`
Added a `NAMED_ENTITIES` map (`amp, lt, gt, quot, apos, nbsp`) and a `decodeEntities` function using a single regex (`/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g`) that handles named entities case-insensitively plus decimal (`&#233;`) and hex (`&#xE9;`/`&#XE9;`) numeric entities via `String.fromCodePoint`. Guards against malformed/out-of-range numeric entities: checks `Number.isFinite(codePoint)` first, then wraps `String.fromCodePoint` in try/catch (it throws `RangeError` for code points outside the valid Unicode range) — either path leaves the original entity text unchanged rather than crashing. Wired into `stripHtml` between tag-stripping and whitespace-collapsing, per the instruction (so `&nbsp;` → space gets collapsed by the subsequent `\s+` pass).

### B. `webTool.test.ts` — new tests
Added 4 tests (14 total in the file now, from 10):
1. **IPv6-literal refusal** — `fetchUrl('https://[::1]/', ['::1'])`. Traced `isIpLiteral`: `new URL('https://[::1]/').hostname` is `'[::1]'` (confirmed via `node -e`), the bracket-strip regex (`replace(/^\[/, '')`.`replace(/\]$/, '')`) yields `'::1'`, which contains `:` → `isIpLiteral` returns `true`, so it refuses before the allowlist check even though `'::1'` is nominally allowlisted. Asserts `fetch` never called.
2. **Invalid URL** — `fetchUrl('not a valid url', ['example.com'])` → `new URL(...)` throws synchronously, caught by the existing `try { currentUrl = new URL(url) } catch { return { ok: false, content: \`Refused: invalid URL "${url}"\` } }`, matched against `/invalid URL/i`. `fetch` never called.
3. **Redirect exhaustion** — mocked `fetch` always returns 302 pointing at itself. Traced the loop: `for (let hop = 0; hop <= MAX_REDIRECTS; hop++)` with `MAX_REDIRECTS = 5` runs hop = 0..5 inclusive = 6 iterations, each calling `fetch` once before re-checking `refusalFor`; after the loop exits it returns `Refused: exceeded 5 redirects`. Asserted `fetch` called exactly 6 times and message matches `/redirect/i`.
4. **Entity decoding** — response body `'<p>Tom &amp; Jerry &lt;3&gt; said &quot;caf&#233;&quot;</p>'`, asserts the decoded string `'Tom & Jerry <3> said "café"'` appears in `result.content`.

## Verification

```
$ npm run typecheck
> icm-runner@0.1.0 typecheck
> tsc --noEmit
(clean, no output)

$ npm test
> icm-runner@0.1.0 test
> vitest run

 RUN  v2.1.9 /home/elroy/projects/agent-design/icm-scaffold/.claude/worktrees/icm-runner-integration/platform/runner

 ✓ test/config.test.ts (10 tests) 22ms
 ✓ test/openrouter.test.ts (4 tests) 22ms
 ✓ test/webTool.test.ts (14 tests) 39ms
 ✓ test/agentLoop.test.ts (6 tests) 36ms
boom
 ✓ test/git.test.ts (5 tests) 511ms
 ✓ test/scriptTool.test.ts (11 tests) 567ms
 ✓ test/commands.test.ts (8 tests) 521ms
 ✓ test/state.test.ts (5 tests) 19ms
 ✓ test/tools.test.ts (5 tests) 29ms
 ✓ test/stageOrder.test.ts (5 tests) 24ms
 ✓ test/lock.test.ts (5 tests) 22ms
 ✓ test/runLog.test.ts (4 tests) 31ms
 ✓ test/tokenBudget.test.ts (4 tests) 6ms
 ✓ test/jail.test.ts (5 tests) 18ms
 ✓ test/version.test.ts (1 test) 5ms

 Test Files  15 passed (15)
      Tests  92 passed (92)
   Start at  16:14:38
   Duration  2.14s (transform 801ms, setup 0ms, collect 1.45s, tests 1.87s, environment 7ms, prepare 2.03s)
```

(`boom` is expected stdout from `test/scriptTool.test.ts`'s "reports a non-zero exit without throwing" fixture script, not a failure.)

92/92 pass — up from the 88/88 baseline by exactly the 4 new webTool tests added in part B.

## Files changed

```
 D platform/runner/INTEGRATION.md
 M platform/runner/src/agentLoop.ts
 M platform/runner/src/commands/run.ts
 M platform/runner/src/runLog.ts
 M platform/runner/src/scriptTool.ts
 M platform/runner/src/tools.ts
 M platform/runner/src/webTool.ts
 M platform/runner/test/tools.test.ts
 M platform/runner/test/webTool.test.ts
```

## Deviations from instructions

- Instructions said "5 such call sites" for `executeTool` in `test/tools.test.ts`; the actual file has 6 call sites across 5 `it` blocks (one block calls it twice: `write_file` then `read_file`). Updated all 6, all 5 blocks — no functional deviation, just a correction to the stated count while doing the work.
- No other deviations. `contracts/` untouched. `INTEGRATION.md` deleted only after typecheck+tests passed.

## Self-review findings

- Traced `resolveInJail`'s double `realpathSync` in the `scriptTool.ts → jail.ts` call path: `runScriptWithTimeout` already resolves `root = realpathSync(workspaceRoot)` before calling `resolveInJail(root, script)`, and `jail.ts`'s `resolveInJail` calls `realpathSync(workspaceRoot)` again internally on that already-resolved root. This is a harmless redundant syscall (idempotent on an already-real path), not new behavior — the pre-collapse duplicated implementation had the identical redundancy, since `scriptTool.ts`'s own `resolveInJail` also did `realpathSync(workspaceRoot)` internally. No behavior change; `test/scriptTool.test.ts`'s jail-escape test still passes.
- Confirmed `JailViolationError` is not re-exported from `scriptTool.ts` and nothing needs it from there (only `test/jail.test.ts` imports it, from `jail.ts` directly).
- Confirmed no other test files call `executeTool`/`createToolContext` besides `test/tools.test.ts`.
- Confirmed `test/commands.test.ts` and `test/agentLoop.test.ts` pass unmodified with the new `loadConfig` call in `run.ts` and `allowedDomains` threading in `agentLoop.ts` — both rely on defaults (`loadConfig` returns defaults when no `runner.config.json` exists in the test workspace; `allowedDomains` defaults to `[]`), which is correct since none of those tests exercise `fetch_url`/`run_script`.
- No lint script exists in `package.json` (only `runner`, `test`, `typecheck`); ran `tsc --noEmit` as the closest available static check — clean.

## Concerns

None blocking. One pre-existing (not introduced by this task) design note carried over from `webTool.ts`'s own comment: the SSRF guard's IP-literal check does not protect against DNS rebinding (an allowlisted hostname resolving to a private/loopback address at fetch time) — documented in the source as a known v2 gap, unchanged by this integration.
