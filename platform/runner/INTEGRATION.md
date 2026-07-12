# Integration wiring — apply AFTER the runtime-core worktree merges

None of this is applied in this worktree. `tools.ts`, `agentLoop.ts`, `commands/run.ts`,
and `runLog.ts` are owned by the parallel runtime-core worktree and don't exist here.
The hunks below are written against the content documented in
`docs/superpowers/plans/2026-07-12-runtime-storage-core.md` (Tasks 5, 9, 10, 11) and the
actual committed `runLog.ts`/`jail.ts`/`lock.ts` in that worktree as of this writing.

## Blocking human decision (read first)

`contracts/schemas/run-log.schema.json` freezes `toolCalls[].tool` to exactly
`["read_file", "write_file", "list_dir", "finish_stage"]` with `additionalProperties: false`
at the item level. Adding `fetch_url`/`run_script` tool-call log entries (see the `runLog.ts`
hunk below) will fail validation against that schema as written. Per `contracts/README.md`
("never modify a contract to fit your code — stop and ask"), this needs a human decision:
extend the frozen enum, or don't log these two tools' calls into `toolCalls` at all. The
hunk below assumes the enum gets extended; if the human decides otherwise, skip that hunk
and adjust the `tools.ts` hunk to not push `fetch_url`/`run_script` entries.

## 1. `runLog.ts` — extend the tool-call union

```diff
--- a/platform/runner/src/runLog.ts
+++ b/platform/runner/src/runLog.ts
@@ -4,7 +4,7 @@
 export interface ToolCallLogEntry {
-  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage';
+  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage' | 'fetch_url' | 'run_script';
   args: Record<string, unknown>;
   result: 'ok' | 'error';
   errorMessage?: string;
   timestamp: string;
 }
```

Corresponding contract change (only if the human approves it — see above):
`contracts/schemas/run-log.schema.json`, `properties.toolCalls.items.properties.tool.enum`
gains `"fetch_url"` and `"run_script"`.

## 2. `tools.ts` — register the two new tools

`executeTool`/`runTool` must become `async` because `fetchUrl` is a `Promise`. This is a
signature change, not just an added `case`.

```diff
--- a/platform/runner/src/tools.ts
+++ b/platform/runner/src/tools.ts
@@ -1,8 +1,10 @@
 import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
 import { dirname, join } from 'node:path';
 import { resolveInJail } from './jail.js';
 import type { ToolDef } from './openrouter.js';
 import type { ToolCallLogEntry } from './runLog.js';
+import { FETCH_URL_DEF, fetchUrl } from './webTool.js';
+import { RUN_SCRIPT_DEF, runScript } from './scriptTool.js';
 
 export const TOOL_DEFS: ToolDef[] = [
   // ...existing read_file / write_file / list_dir / finish_stage entries, unchanged...
+  FETCH_URL_DEF,
+  RUN_SCRIPT_DEF,
 ];
 
 export interface ToolContext {
   workspaceRoot: string;
   filesRead: Set<string>;
   filesWritten: Set<string>;
   toolCalls: ToolCallLogEntry[];
   finished: boolean;
   gateSummary?: string;
+  allowedDomains: string[];
 }
 
 export interface ToolResult {
   ok: boolean;
   content: string;
 }
 
-export function createToolContext(workspaceRoot: string): ToolContext {
+export function createToolContext(workspaceRoot: string, allowedDomains: string[] = []): ToolContext {
   return {
     workspaceRoot,
     filesRead: new Set(),
     filesWritten: new Set(),
     toolCalls: [],
     finished: false,
+    allowedDomains,
   };
 }
 
-export function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
+export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
   const timestamp = new Date().toISOString();
   try {
-    const content = runTool(name, args, ctx);
+    const content = await runTool(name, args, ctx);
     ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'ok', timestamp });
     return { ok: true, content };
   } catch (err) {
     const errorMessage = err instanceof Error ? err.message : String(err);
     ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'error', errorMessage, timestamp });
     return { ok: false, content: errorMessage };
   }
 }
 
-function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): string {
+async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
   switch (name) {
     // ...existing read_file / write_file / list_dir / finish_stage cases, unchanged...
+    case 'fetch_url': {
+      const url = requireString(args, 'url');
+      const result = await fetchUrl(url, ctx.allowedDomains);
+      if (!result.ok) throw new Error(result.content);
+      return result.content;
+    }
+    case 'run_script': {
+      const script = requireString(args, 'script');
+      const scriptArgs = Array.isArray(args.args) ? (args.args as string[]) : [];
+      const result = runScript(ctx.workspaceRoot, script, scriptArgs);
+      if (!result.ok) throw new Error(result.content);
+      return result.content;
+    }
     default:
       throw new Error(`Unknown tool: ${name}`);
   }
 }
```

## 3. `agentLoop.ts` — thread `allowedDomains` through, await the now-async `executeTool`

```diff
--- a/platform/runner/src/agentLoop.ts
+++ b/platform/runner/src/agentLoop.ts
@@ export interface AgentLoopParams {
   workspaceRoot: string;
   stage: string;
   model?: string;
   apiKey: string;
   tokenBudget?: number;
   chatCompletionFn?: ChatCompletionFn;
+  allowedDomains?: string[];
 }
@@ export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
-  const ctx: ToolContext = createToolContext(params.workspaceRoot);
+  const ctx: ToolContext = createToolContext(params.workspaceRoot, params.allowedDomains ?? []);
@@       for (const call of toolCalls) {
         const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
-        const result = executeTool(call.function.name, args, ctx);
+        const result = await executeTool(call.function.name, args, ctx);
```

## 4. `commands/run.ts` — load config, pass model/tokenBudget/allowedDomains through

```diff
--- a/platform/runner/src/commands/run.ts
+++ b/platform/runner/src/commands/run.ts
@@
 import { randomUUID } from 'node:crypto';
 import { acquireLock, releaseLock } from '../lock.js';
 import { runAgentLoop } from '../agentLoop.js';
 import type { ChatCompletionFn } from '../openrouter.js';
 import { writeRunLog } from '../runLog.js';
 import { commitWorkspace } from '../git.js';
 import { updateStageState } from '../state.js';
+import { loadConfig } from '../config.js';
 
 export interface RunCommandDeps {
   chatCompletionFn?: ChatCompletionFn;
 }
 
 export async function runCommand(workspaceRoot: string, stage: string, deps: RunCommandDeps = {}): Promise<void> {
   const apiKey = process.env.OPENROUTER_API_KEY;
   if (!apiKey) {
     throw new Error('OPENROUTER_API_KEY is not set');
   }
 
+  const config = loadConfig(workspaceRoot);
   const runId = randomUUID();
   acquireLock(workspaceRoot, runId, stage);
   const startedAt = new Date().toISOString();
 
   try {
     const result = await runAgentLoop({
       workspaceRoot,
       stage,
       apiKey,
+      model: config.model,
+      tokenBudget: config.tokenBudget,
+      allowedDomains: config.allowedDomains,
       chatCompletionFn: deps.chatCompletionFn,
     });
```

`result.model` (already written into `writeRunLog`'s `model` field by the existing code)
now reflects the configured model automatically — no further change needed there.

## 5. Collapse the duplicated jail check

```diff
--- a/platform/runner/src/scriptTool.ts
+++ b/platform/runner/src/scriptTool.ts
@@
 import { execFileSync } from 'node:child_process';
-import { existsSync, realpathSync } from 'node:fs';
-import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';
+import { realpathSync } from 'node:fs';
+import { relative, extname } from 'node:path';
+import { resolveInJail, JailViolationError } from './jail.js';
 
 export interface ToolDef {
   type: 'function';
   function: { name: string; description: string; parameters: Record<string, unknown> };
 }
 
-// Mirrors platform/runner/src/jail.ts's resolveInJail/JailViolationError. Duplicated
-// because that file is owned by a parallel worktree and doesn't exist here yet — collapse
-// into a single import after merge (see INTEGRATION.md).
-export class JailViolationError extends Error {
-  constructor(public readonly attemptedPath: string) {
-    super(`Path escapes workspace jail: ${attemptedPath}`);
-    this.name = 'JailViolationError';
-  }
-}
-
-export function resolveInJail(workspaceRoot: string, relativePath: string): string {
-  ... (delete the mirrored implementation and its two private helpers) ...
-}
-
 const STAGE_SCRIPTS_SEGMENT_INDEX = 2;
```

`webTool.ts`'s and `scriptTool.ts`'s local `ToolDef` interfaces should likewise be deleted
and replaced with `import type { ToolDef } from './openrouter.js';`.
