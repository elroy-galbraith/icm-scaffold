# Runtime & Storage Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI-driven runner (`platform/runner/`) that executes one ICM stage end-to-end against a workspace folder: an agent tool-loop over OpenRouter that reads context, writes stage outputs, and stops at the review gate, wrapped in a filesystem jail, run lock, token budget, git audit trail, and run log.

**Architecture:** A TypeScript/Node package with small, single-responsibility modules (jail, lock, token budget, run log, workspace state, git, OpenRouter client, tools, agent loop) composed by four CLI commands (`run`, `status`, `approve`, `reject`). The agent loop is a plain chat-completion + tool-calling loop — no framework — where the model itself navigates `CLAUDE.md` → `CONTEXT.md` → stage `CONTEXT.md`, exactly as a human driving Claude Code does today.

**Tech Stack:** TypeScript (Node ≥20, ESM), `tsx` for running without a build step, `vitest` for tests, no HTTP/agent framework dependency (raw `fetch` against OpenRouter).

## Global Constraints

(Copied verbatim from `docs/mvp-spec.md`, applicable across this sub-project.)

- "Filesystem access jailed to the workspace folder (container mount is the jail — no Firecracker/E2B until multi-tenant hosting)." (§1)
- "One run at a time per workspace (lock file). Concurrent runs are v2." (§1)
- "Per-run token budget cap; run aborts cleanly and reports spend when hit." (§1)
- "Git commit at every stage completion and every human edit → the audit trail." (§2)
- "OpenRouter as the single model gateway (one env var per deploy for the key)." (§5)
- "Model pinned per workspace, recorded in run metadata for reproducibility." (§5) — this sub-project records the model in the run log; per-workspace *configuration* of the model is deferred to the model-gateway sub-project (see design doc §"Decisions to pin during planning").
- Per the design doc: MinIO/S3 sync, multi-model config, and the outbound network allowlist are explicitly out of scope for this plan.
- **`contracts/` is frozen and authoritative for the on-disk file shapes and CLI behavior a parallel web-backend worktree depends on.** Read-only for this plan: if an implementation choice here doesn't fit a contract, stop and ask — never edit `contracts/`. Where a schema in `contracts/schemas/` and this plan disagree, the schema wins. Two amendments were required (see `contracts/README.md` "Required runner amendments") and are folded into Tasks 3 and 11 below: a `stage` field on `LockInfo`, and stage-ordering enforcement with a `--force` bypass in `runner run`.

All file paths below are relative to the repo root unless stated otherwise.

---

### Task 1: Project scaffolding

**Files:**
- Create: `platform/runner/package.json`
- Create: `platform/runner/tsconfig.json`
- Create: `platform/runner/vitest.config.ts`
- Create: `platform/runner/src/.gitkeep` (removed once Task 2 adds real source)
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: a working `npm test` and `npm run typecheck` in `platform/runner/`, which every later task relies on.

- [ ] **Step 1: Create the package directory and `package.json`**

```json
{
  "name": "icm-runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "runner": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Save as `platform/runner/package.json`.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Save as `platform/runner/tsconfig.json`.

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Save as `platform/runner/vitest.config.ts`.

- [ ] **Step 4: Install dependencies**

Run: `cd platform/runner && npm install`
Expected: `node_modules/` and `package-lock.json` created, no errors.

- [ ] **Step 5: Add a placeholder source file so `typecheck`/`test` have something to run**

```typescript
export const RUNNER_VERSION = '0.1.0';
```

Save as `platform/runner/src/version.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { RUNNER_VERSION } from '../src/version.js';

describe('scaffolding smoke test', () => {
  it('exposes a version string', () => {
    expect(RUNNER_VERSION).toBe('0.1.0');
  });
});
```

Save as `platform/runner/test/version.test.ts`.

- [ ] **Step 6: Run typecheck and tests**

Run: `cd platform/runner && npm run typecheck && npm test`
Expected: typecheck passes with no errors; test run shows `1 passed`.

- [ ] **Step 7: Update repo-root `.gitignore`**

Add these lines to `.gitignore` (repo root):

```
platform/runner/node_modules/
platform/runner/dist/
.runner.lock
.runner/
```

- [ ] **Step 8: Commit**

```bash
git add platform/runner/package.json platform/runner/package-lock.json platform/runner/tsconfig.json platform/runner/vitest.config.ts platform/runner/src/version.ts platform/runner/test/version.test.ts .gitignore
git commit -m "runner: scaffold TypeScript package with vitest"
```

---

### Task 2: Filesystem jail

**Files:**
- Create: `platform/runner/src/jail.ts`
- Test: `platform/runner/test/jail.test.ts`

**Interfaces:**
- Produces: `resolveInJail(workspaceRoot: string, relativePath: string): string` — throws `JailViolationError` if the path escapes the workspace (absolute path, `../` traversal, or symlink escape). Returns the resolved absolute path otherwise. Used by Task 9 (`tools.ts`).
- Produces: `class JailViolationError extends Error { attemptedPath: string }`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInJail, JailViolationError } from '../src/jail.js';

describe('resolveInJail', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'jail-root-')));
    outside = realpathSync(mkdtempSync(join(tmpdir(), 'jail-outside-')));
    mkdirSync(join(root, 'output'));
    writeFileSync(join(outside, 'secret.txt'), 'nope');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('resolves a normal relative path inside the workspace', () => {
    const resolved = resolveInJail(root, 'output/findings.md');
    expect(resolved).toBe(join(root, 'output', 'findings.md'));
  });

  it('rejects ../ traversal out of the workspace', () => {
    expect(() => resolveInJail(root, '../secret.txt')).toThrow(JailViolationError);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveInJail(root, '/etc/passwd')).toThrow(JailViolationError);
  });

  it('rejects a symlink that escapes the workspace', () => {
    symlinkSync(outside, join(root, 'escape'));
    expect(() => resolveInJail(root, 'escape/secret.txt')).toThrow(JailViolationError);
  });

  it('allows a new file path that does not exist yet', () => {
    const resolved = resolveInJail(root, 'output/new-file.md');
    expect(resolved).toBe(join(root, 'output', 'new-file.md'));
  });
});
```

Save as `platform/runner/test/jail.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/jail.test.ts`
Expected: FAIL — `Cannot find module '../src/jail.js'`.

- [ ] **Step 3: Implement `jail.ts`**

```typescript
import { realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

export class JailViolationError extends Error {
  constructor(public readonly attemptedPath: string) {
    super(`Path escapes workspace jail: ${attemptedPath}`);
    this.name = 'JailViolationError';
  }
}

export function resolveInJail(workspaceRoot: string, relativePath: string): string {
  const root = realpathSync(workspaceRoot);

  if (isAbsolute(relativePath)) {
    throw new JailViolationError(relativePath);
  }

  const candidate = resolve(root, relativePath);
  assertInside(root, candidate);

  const realCandidate = nearestRealPath(candidate);
  assertInside(root, realCandidate);

  return candidate;
}

function assertInside(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${'/'}`) || isAbsolute(rel)) {
    throw new JailViolationError(candidate);
  }
}

function nearestRealPath(candidate: string): string {
  let current = candidate;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return candidate;
    }
    current = parent;
  }
  const real = realpathSync(current);
  const suffix = relative(current, candidate);
  return suffix ? resolve(real, suffix) : real;
}
```

Save as `platform/runner/src/jail.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/jail.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/jail.ts platform/runner/test/jail.test.ts
git commit -m "runner: add filesystem jail"
```

---

### Task 3: Lock file

> **Amended (contract-driven):** `contracts/schemas/lock.schema.json` requires a `stage`
> field on `LockInfo` so a UI can tell which stage is running (`contracts/README.md`
> "Required runner amendments" #1). `acquireLock` now takes `stage` and writes it.

**Files:**
- Create: `platform/runner/src/lock.ts`
- Test: `platform/runner/test/lock.test.ts`

**Interfaces:**
- Produces: `acquireLock(workspaceRoot: string, runId: string, stage: string): void` — throws `LockHeldError` if already locked.
- Produces: `releaseLock(workspaceRoot: string): void` — no-op if not locked.
- Produces: `readLock(workspaceRoot: string): LockInfo | null`.
- Produces: `interface LockInfo { runId: string; stage: string; pid: number; acquiredAt: string }` (matches `contracts/schemas/lock.schema.json` exactly — `additionalProperties: false` there, so do not add fields beyond these four).
- Produces: `class LockHeldError extends Error { holder: LockInfo }`.
- Consumed by: Task 11 (`commands/run.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, releaseLock, readLock, LockHeldError } from '../src/lock.js';

describe('lock', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'lock-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('acquires a lock and records it', () => {
    acquireLock(workspaceRoot, 'run-1', '01_research');
    const lock = readLock(workspaceRoot);
    expect(lock?.runId).toBe('run-1');
    expect(lock?.stage).toBe('01_research');
    expect(lock?.pid).toBe(process.pid);
  });

  it('rejects a second acquire while the first is held', () => {
    acquireLock(workspaceRoot, 'run-1', '01_research');
    expect(() => acquireLock(workspaceRoot, 'run-2', '02_analysis')).toThrow(LockHeldError);
  });

  it('reports the holder (including stage) on LockHeldError', () => {
    acquireLock(workspaceRoot, 'run-1', '01_research');
    try {
      acquireLock(workspaceRoot, 'run-2', '02_analysis');
      throw new Error('expected LockHeldError');
    } catch (err) {
      expect(err).toBeInstanceOf(LockHeldError);
      expect((err as LockHeldError).holder.runId).toBe('run-1');
      expect((err as LockHeldError).holder.stage).toBe('01_research');
    }
  });

  it('allows re-acquiring after release', () => {
    acquireLock(workspaceRoot, 'run-1', '01_research');
    releaseLock(workspaceRoot);
    expect(readLock(workspaceRoot)).toBeNull();
    acquireLock(workspaceRoot, 'run-2', '02_analysis');
    expect(readLock(workspaceRoot)?.runId).toBe('run-2');
  });

  it('releasing an unlocked workspace is a no-op', () => {
    expect(() => releaseLock(workspaceRoot)).not.toThrow();
  });
});
```

Save as `platform/runner/test/lock.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/lock.test.ts`
Expected: FAIL — `Cannot find module '../src/lock.js'`.

- [ ] **Step 3: Implement `lock.ts`**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface LockInfo {
  runId: string;
  stage: string;
  pid: number;
  acquiredAt: string;
}

export class LockHeldError extends Error {
  constructor(public readonly holder: LockInfo) {
    super(
      `Workspace is locked by run ${holder.runId} (stage ${holder.stage}, pid ${holder.pid}) since ${holder.acquiredAt}`
    );
    this.name = 'LockHeldError';
  }
}

function lockPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner.lock');
}

export function acquireLock(workspaceRoot: string, runId: string, stage: string): void {
  const path = lockPath(workspaceRoot);
  if (existsSync(path)) {
    const holder = JSON.parse(readFileSync(path, 'utf-8')) as LockInfo;
    throw new LockHeldError(holder);
  }
  const info: LockInfo = { runId, stage, pid: process.pid, acquiredAt: new Date().toISOString() };
  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(path, JSON.stringify(info, null, 2));
}

export function releaseLock(workspaceRoot: string): void {
  const path = lockPath(workspaceRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function readLock(workspaceRoot: string): LockInfo | null {
  const path = lockPath(workspaceRoot);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as LockInfo;
}
```

Save as `platform/runner/src/lock.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/lock.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/lock.ts platform/runner/test/lock.test.ts
git commit -m "runner: add workspace run lock"
```

---

### Task 4: Token budget

**Files:**
- Create: `platform/runner/src/tokenBudget.ts`
- Test: `platform/runner/test/tokenBudget.test.ts`

**Interfaces:**
- Produces: `class TokenBudget { constructor(budget: number); add(tokens: number): void; get spent(): number; get remaining(): number }` — `add` throws `BudgetExceededError` once cumulative spend exceeds `budget`, but still records the spend.
- Produces: `class BudgetExceededError extends Error { spent: number; budget: number }`.
- Consumed by: Task 10 (`agentLoop.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { TokenBudget, BudgetExceededError } from '../src/tokenBudget.js';

describe('TokenBudget', () => {
  it('tracks spend under budget without throwing', () => {
    const budget = new TokenBudget(100);
    budget.add(40);
    budget.add(40);
    expect(budget.spent).toBe(80);
    expect(budget.remaining).toBe(20);
  });

  it('throws BudgetExceededError once spend exceeds the budget', () => {
    const budget = new TokenBudget(100);
    budget.add(60);
    expect(() => budget.add(60)).toThrow(BudgetExceededError);
  });

  it('still records spend after exceeding the budget', () => {
    const budget = new TokenBudget(100);
    try {
      budget.add(150);
    } catch {
      // expected
    }
    expect(budget.spent).toBe(150);
  });

  it('floors remaining at 0 when over budget', () => {
    const budget = new TokenBudget(100);
    try {
      budget.add(150);
    } catch {
      // expected
    }
    expect(budget.remaining).toBe(0);
  });
});
```

Save as `platform/runner/test/tokenBudget.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/tokenBudget.test.ts`
Expected: FAIL — `Cannot find module '../src/tokenBudget.js'`.

- [ ] **Step 3: Implement `tokenBudget.ts`**

```typescript
export class BudgetExceededError extends Error {
  constructor(public readonly spent: number, public readonly budget: number) {
    super(`Token budget exceeded: spent ${spent} of ${budget}`);
    this.name = 'BudgetExceededError';
  }
}

export class TokenBudget {
  private spentTokens = 0;

  constructor(private readonly budget: number) {}

  add(tokens: number): void {
    this.spentTokens += tokens;
    if (this.spentTokens > this.budget) {
      throw new BudgetExceededError(this.spentTokens, this.budget);
    }
  }

  get spent(): number {
    return this.spentTokens;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.spentTokens);
  }
}
```

Save as `platform/runner/src/tokenBudget.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/tokenBudget.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/tokenBudget.ts platform/runner/test/tokenBudget.test.ts
git commit -m "runner: add per-run token budget tracker"
```

---

### Task 5: Run log

**Files:**
- Create: `platform/runner/src/runLog.ts`
- Test: `platform/runner/test/runLog.test.ts`

**Interfaces:**
- Produces: `type RunStatus = 'completed' | 'aborted_budget' | 'error'`.
- Produces: `interface ToolCallLogEntry { tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage'; args: Record<string, unknown>; result: 'ok' | 'error'; errorMessage?: string; timestamp: string }`.
- Produces: `interface RunLog { runId: string; stage: string; model: string; startedAt: string; endedAt: string; status: RunStatus; filesRead: string[]; filesWritten: string[]; toolCalls: ToolCallLogEntry[]; tokensSpent: number; tokenBudget: number; gateSummary?: string; errorMessage?: string }`.
- Produces: `writeRunLog(workspaceRoot: string, log: RunLog): string` (returns the file path written).
- Produces: `readLatestRunLog(workspaceRoot: string, stage?: string): RunLog | null`.
- Consumed by: Task 9 (`tools.ts`, for `ToolCallLogEntry`), Task 10 (`agentLoop.ts`, for `RunStatus`), Task 11 (`commands/run.ts`, `commands/status.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRunLog, readLatestRunLog, type RunLog } from '../src/runLog.js';

function makeLog(overrides: Partial<RunLog>): RunLog {
  return {
    runId: 'run-1',
    stage: '01_research',
    model: 'anthropic/claude-sonnet-5',
    startedAt: '2026-07-12T10:00:00.000Z',
    endedAt: '2026-07-12T10:01:00.000Z',
    status: 'completed',
    filesRead: [],
    filesWritten: [],
    toolCalls: [],
    tokensSpent: 100,
    tokenBudget: 200000,
    ...overrides,
  };
}

describe('runLog', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'runlog-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns null when there are no runs yet', () => {
    expect(readLatestRunLog(workspaceRoot)).toBeNull();
  });

  it('writes and reads back a run log', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1' }));
    const log = readLatestRunLog(workspaceRoot);
    expect(log?.runId).toBe('run-1');
  });

  it('returns the most recent run for a stage', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1', endedAt: '2026-07-12T10:01:00.000Z' }));
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-2', endedAt: '2026-07-12T11:00:00.000Z' }));
    const log = readLatestRunLog(workspaceRoot, '01_research');
    expect(log?.runId).toBe('run-2');
  });

  it('filters by stage', () => {
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-1', stage: '01_research' }));
    writeRunLog(workspaceRoot, makeLog({ runId: 'run-2', stage: '02_analysis', endedAt: '2026-07-12T12:00:00.000Z' }));
    const log = readLatestRunLog(workspaceRoot, '01_research');
    expect(log?.runId).toBe('run-1');
  });
});
```

Save as `platform/runner/test/runLog.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/runLog.test.ts`
Expected: FAIL — `Cannot find module '../src/runLog.js'`.

- [ ] **Step 3: Implement `runLog.ts`**

```typescript
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RunStatus = 'completed' | 'aborted_budget' | 'error';

export interface ToolCallLogEntry {
  tool: 'read_file' | 'write_file' | 'list_dir' | 'finish_stage';
  args: Record<string, unknown>;
  result: 'ok' | 'error';
  errorMessage?: string;
  timestamp: string;
}

export interface RunLog {
  runId: string;
  stage: string;
  model: string;
  startedAt: string;
  endedAt: string;
  status: RunStatus;
  filesRead: string[];
  filesWritten: string[];
  toolCalls: ToolCallLogEntry[];
  tokensSpent: number;
  tokenBudget: number;
  gateSummary?: string;
  errorMessage?: string;
}

function runsDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner', 'runs');
}

export function writeRunLog(workspaceRoot: string, log: RunLog): string {
  const dir = runsDir(workspaceRoot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${log.runId}.json`);
  writeFileSync(path, JSON.stringify(log, null, 2));
  return path;
}

export function readLatestRunLog(workspaceRoot: string, stage?: string): RunLog | null {
  const dir = runsDir(workspaceRoot);
  if (!existsSync(dir)) return null;
  const logs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as RunLog)
    .filter((l) => !stage || l.stage === stage)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  return logs.length > 0 ? logs[logs.length - 1] : null;
}
```

Save as `platform/runner/src/runLog.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/runLog.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/runLog.ts platform/runner/test/runLog.test.ts
git commit -m "runner: add structured run log"
```

---

### Task 6: Workspace state

**Files:**
- Create: `platform/runner/src/state.ts`
- Test: `platform/runner/test/state.test.ts`

**Interfaces:**
- Produces: `type StageStatus = 'pending' | 'awaiting_review' | 'approved' | 'rejected'`.
- Produces: `interface StageState { status: StageStatus; lastRunId?: string; comment?: string; updatedAt: string }`.
- Produces: `interface WorkspaceState { stages: Record<string, StageState> }`.
- Produces: `readState(workspaceRoot: string): WorkspaceState`.
- Produces: `writeState(workspaceRoot: string, state: WorkspaceState): void`.
- Produces: `updateStageState(workspaceRoot: string, stage: string, patch: Partial<Omit<StageState, 'updatedAt'>>): WorkspaceState`.
- Consumed by: Task 11 (`commands/run.ts`, `commands/status.ts`, `commands/approve.ts`, `commands/reject.ts`, `stageOrder.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, updateStageState } from '../src/state.js';

describe('state', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'state-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('starts with no stages', () => {
    expect(readState(workspaceRoot)).toEqual({ stages: {} });
  });

  it('creates a stage entry on first update', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('awaiting_review');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('preserves fields not included in the patch', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'awaiting_review', lastRunId: 'run-1' });
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['01_research'].lastRunId).toBe('run-1');
  });

  it('records a rejection comment', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'rejected', comment: 'too shallow' });
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].comment).toBe('too shallow');
  });
});
```

Save as `platform/runner/test/state.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/state.test.ts`
Expected: FAIL — `Cannot find module '../src/state.js'`.

- [ ] **Step 3: Implement `state.ts`**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type StageStatus = 'pending' | 'awaiting_review' | 'approved' | 'rejected';

export interface StageState {
  status: StageStatus;
  lastRunId?: string;
  comment?: string;
  updatedAt: string;
}

export interface WorkspaceState {
  stages: Record<string, StageState>;
}

function statePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.runner', 'state.json');
}

export function readState(workspaceRoot: string): WorkspaceState {
  const path = statePath(workspaceRoot);
  if (!existsSync(path)) {
    return { stages: {} };
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as WorkspaceState;
}

export function writeState(workspaceRoot: string, state: WorkspaceState): void {
  const path = statePath(workspaceRoot);
  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function updateStageState(
  workspaceRoot: string,
  stage: string,
  patch: Partial<Omit<StageState, 'updatedAt'>>
): WorkspaceState {
  const state = readState(workspaceRoot);
  const existing = state.stages[stage];
  state.stages[stage] = {
    status: patch.status ?? existing?.status ?? 'pending',
    lastRunId: patch.lastRunId ?? existing?.lastRunId,
    comment: patch.comment ?? existing?.comment,
    updatedAt: new Date().toISOString(),
  };
  writeState(workspaceRoot, state);
  return state;
}
```

Save as `platform/runner/src/state.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/state.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/state.ts platform/runner/test/state.test.ts
git commit -m "runner: add per-workspace pipeline state"
```

---

### Task 7: Git integration

**Files:**
- Create: `platform/runner/src/git.ts`
- Test: `platform/runner/test/git.test.ts`

**Interfaces:**
- Produces: `commitWorkspace(workspaceRoot: string, message: string): string` — stages all changes and commits; if nothing changed, makes no commit and returns the current `HEAD` sha unchanged.
- Produces: `currentHead(workspaceRoot: string): string`.
- Consumed by: Task 11 (`commands/run.ts`, `commands/approve.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitWorkspace, currentHead } from '../src/git.js';

describe('git', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'git-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    writeFileSync(join(workspaceRoot, 'seed.txt'), 'seed');
    commitWorkspace(workspaceRoot, 'seed commit');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('commits changed files and advances HEAD', () => {
    const before = currentHead(workspaceRoot);
    writeFileSync(join(workspaceRoot, 'output.txt'), 'result');
    const after = commitWorkspace(workspaceRoot, 'stage run');
    expect(after).not.toBe(before);
    expect(currentHead(workspaceRoot)).toBe(after);
  });

  it('is a no-op when nothing changed', () => {
    const before = currentHead(workspaceRoot);
    const after = commitWorkspace(workspaceRoot, 'nothing to commit');
    expect(after).toBe(before);
  });
});
```

Save as `platform/runner/test/git.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/git.test.ts`
Expected: FAIL — `Cannot find module '../src/git.js'`.

- [ ] **Step 3: Implement `git.ts`**

```typescript
import { execFileSync } from 'node:child_process';

export function commitWorkspace(workspaceRoot: string, message: string): string {
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
  if (status.trim().length === 0) {
    return currentHead(workspaceRoot);
  }
  execFileSync('git', ['commit', '-m', message], { cwd: workspaceRoot });
  return currentHead(workspaceRoot);
}

export function currentHead(workspaceRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
}
```

Save as `platform/runner/src/git.ts`.

Note: arguments are passed as separate `execFileSync` array elements (not interpolated into a shell string), so commit messages containing special characters cannot inject shell commands.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/git.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/git.ts platform/runner/test/git.test.ts
git commit -m "runner: add git commit-as-audit-trail helper"
```

---

### Task 8: OpenRouter client

**Files:**
- Create: `platform/runner/src/openrouter.ts`
- Test: `platform/runner/test/openrouter.test.ts`

**Interfaces:**
- Produces: `interface ChatMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; tool_calls?: ToolCall[]; name?: string }`.
- Produces: `interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }`.
- Produces: `interface ToolDef { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }`.
- Produces: `interface ChatCompletionResult { message: ChatMessage; totalTokens: number }`.
- Produces: `interface ChatCompletionParams { model: string; messages: ChatMessage[]; tools: ToolDef[]; apiKey: string }`.
- Produces: `chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>`.
- Produces: `type ChatCompletionFn = typeof chatCompletion`.
- Consumed by: Task 9 (`ToolDef`), Task 10 (`agentLoop.ts`), Task 11 (`commands/run.ts`, for the `ChatCompletionFn` type used in dependency injection).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatCompletion } from '../src/openrouter.js';

describe('chatCompletion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends model/messages/tools and parses the response', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('anthropic/claude-sonnet-5');
      expect(body.messages).toHaveLength(1);
      expect(body.tools).toHaveLength(0);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'hello' } }],
          usage: { total_tokens: 42 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });

    expect(result.message.content).toBe('hello');
    expect(result.totalTokens).toBe(42);
  });

  it('throws with the response body when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 }))
    );

    await expect(
      chatCompletion({ model: 'm', messages: [], tools: [], apiKey: 'k' })
    ).rejects.toThrow(/429/);
  });
});
```

Save as `platform/runner/test/openrouter.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/openrouter.test.ts`
Expected: FAIL — `Cannot find module '../src/openrouter.js'`.

- [ ] **Step 3: Implement `openrouter.ts`**

```typescript
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionResult {
  message: ChatMessage;
  totalTokens: number;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  apiKey: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      tools: params.tools,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: ChatMessage }>;
    usage?: { total_tokens?: number };
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error('OpenRouter response had no choices');
  }

  return {
    message: choice.message,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
}

export type ChatCompletionFn = typeof chatCompletion;
```

Save as `platform/runner/src/openrouter.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/openrouter.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/openrouter.ts platform/runner/test/openrouter.test.ts
git commit -m "runner: add OpenRouter chat-completion client"
```

---

### Task 9: Tools (read_file, write_file, list_dir, finish_stage)

**Files:**
- Create: `platform/runner/src/tools.ts`
- Test: `platform/runner/test/tools.test.ts`

**Interfaces:**
- Consumes: `resolveInJail`, `JailViolationError` from `./jail.js` (Task 2); `ToolDef` from `./openrouter.js` (Task 8); `ToolCallLogEntry` from `./runLog.js` (Task 5).
- Produces: `const TOOL_DEFS: ToolDef[]` — definitions for `read_file`, `write_file`, `list_dir`, `finish_stage`.
- Produces: `interface ToolContext { workspaceRoot: string; filesRead: Set<string>; filesWritten: Set<string>; toolCalls: ToolCallLogEntry[]; finished: boolean; gateSummary?: string }`.
- Produces: `createToolContext(workspaceRoot: string): ToolContext`.
- Produces: `interface ToolResult { ok: boolean; content: string }`.
- Produces: `executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult` — never throws; tool-level failures (jail violation, missing file, bad args) are caught and returned as `{ ok: false, content: <error message> }`, and also appended to `ctx.toolCalls`.
- Consumed by: Task 10 (`agentLoop.ts`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeTool, createToolContext } from '../src/tools.js';

describe('tools', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'tools-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('writes then reads a file, tracking both sets', () => {
    const ctx = createToolContext(workspaceRoot);
    const writeResult = executeTool('write_file', { path: 'output/findings.md', content: '# Findings' }, ctx);
    expect(writeResult.ok).toBe(true);

    const readResult = executeTool('read_file', { path: 'output/findings.md' }, ctx);
    expect(readResult.ok).toBe(true);
    expect(readResult.content).toBe('# Findings');

    expect(ctx.filesWritten.has('output/findings.md')).toBe(true);
    expect(ctx.filesRead.has('output/findings.md')).toBe(true);
    expect(ctx.toolCalls).toHaveLength(2);
  });

  it('lists directory entries, marking directories with a trailing slash', () => {
    mkdirSync(join(workspaceRoot, 'stages'));
    writeFileSync(join(workspaceRoot, 'CLAUDE.md'), '# root');
    const ctx = createToolContext(workspaceRoot);
    const result = executeTool('list_dir', { path: '.' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.content.split('\n')).toEqual(expect.arrayContaining(['stages/', 'CLAUDE.md']));
  });

  it('marks the context finished on finish_stage', () => {
    const ctx = createToolContext(workspaceRoot);
    const result = executeTool('finish_stage', { gateSummary: 'Done. Verify: ok.' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.finished).toBe(true);
    expect(ctx.gateSummary).toBe('Done. Verify: ok.');
  });

  it('returns ok:false without throwing when a file is missing', () => {
    const ctx = createToolContext(workspaceRoot);
    const result = executeTool('read_file', { path: 'missing.md' }, ctx);
    expect(result.ok).toBe(false);
    expect(ctx.toolCalls[0].result).toBe('error');
  });

  it('returns ok:false without throwing on a jail violation', () => {
    const ctx = createToolContext(workspaceRoot);
    const result = executeTool('read_file', { path: '../secret.txt' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/jail/i);
  });
});
```

Save as `platform/runner/test/tools.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/tools.test.ts`
Expected: FAIL — `Cannot find module '../src/tools.js'`.

- [ ] **Step 3: Implement `tools.ts`**

```typescript
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveInJail } from './jail.js';
import type { ToolDef } from './openrouter.js';
import type { ToolCallLogEntry } from './runLog.js';

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file at a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write UTF-8 text content to a path relative to the workspace root, creating parent directories as needed.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List entries in a directory at a path relative to the workspace root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_stage',
      description:
        'Call this when the stage is complete and ready for human review. Provide the gate summary shown to the reviewer, including the stage Verify checklist.',
      parameters: {
        type: 'object',
        properties: { gateSummary: { type: 'string' } },
        required: ['gateSummary'],
      },
    },
  },
];

export interface ToolContext {
  workspaceRoot: string;
  filesRead: Set<string>;
  filesWritten: Set<string>;
  toolCalls: ToolCallLogEntry[];
  finished: boolean;
  gateSummary?: string;
}

export interface ToolResult {
  ok: boolean;
  content: string;
}

export function createToolContext(workspaceRoot: string): ToolContext {
  return {
    workspaceRoot,
    filesRead: new Set(),
    filesWritten: new Set(),
    toolCalls: [],
    finished: false,
  };
}

export function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolResult {
  const timestamp = new Date().toISOString();
  try {
    const content = runTool(name, args, ctx);
    ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'ok', timestamp });
    return { ok: true, content };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.toolCalls.push({ tool: name as ToolCallLogEntry['tool'], args, result: 'error', errorMessage, timestamp });
    return { ok: false, content: errorMessage };
  }
}

function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): string {
  switch (name) {
    case 'read_file': {
      const path = requireString(args, 'path');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      const content = readFileSync(resolved, 'utf-8');
      ctx.filesRead.add(path);
      return content;
    }
    case 'write_file': {
      const path = requireString(args, 'path');
      const content = requireString(args, 'content');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, content, 'utf-8');
      ctx.filesWritten.add(path);
      return `Wrote ${content.length} bytes to ${path}`;
    }
    case 'list_dir': {
      const path = requireString(args, 'path');
      const resolved = resolveInJail(ctx.workspaceRoot, path);
      const entries = readdirSync(resolved).map((entry) => {
        const isDir = statSync(join(resolved, entry)).isDirectory();
        return isDir ? `${entry}/` : entry;
      });
      return entries.join('\n');
    }
    case 'finish_stage': {
      const gateSummary = requireString(args, 'gateSummary');
      ctx.finished = true;
      ctx.gateSummary = gateSummary;
      return 'Stage marked finished; awaiting human review.';
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid "${key}" argument`);
  }
  return value;
}
```

Save as `platform/runner/src/tools.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/tools.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/tools.ts platform/runner/test/tools.test.ts
git commit -m "runner: add jailed read_file/write_file/list_dir/finish_stage tools"
```

---

### Task 10: Agent loop

**Files:**
- Create: `platform/runner/src/agentLoop.ts`
- Create fixtures: `platform/runner/test/fixtures/workspace/CLAUDE.md`, `platform/runner/test/fixtures/workspace/CONTEXT.md`, `platform/runner/test/fixtures/workspace/stages/01_research/CONTEXT.md`
- Test: `platform/runner/test/agentLoop.test.ts`

**Interfaces:**
- Consumes: `TOOL_DEFS`, `createToolContext`, `executeTool`, `ToolContext` from `./tools.js` (Task 9); `TokenBudget`, `BudgetExceededError` from `./tokenBudget.js` (Task 4); `ChatCompletionFn`, `ChatMessage`, `chatCompletion` from `./openrouter.js` (Task 8); `RunStatus`, `ToolCallLogEntry` from `./runLog.js` (Task 5).
- Produces: `const DEFAULT_MODEL = 'anthropic/claude-sonnet-5'`.
- Produces: `const DEFAULT_TOKEN_BUDGET = 200_000`.
- Produces: `interface AgentLoopParams { workspaceRoot: string; stage: string; model?: string; apiKey: string; tokenBudget?: number; chatCompletionFn?: ChatCompletionFn }`.
- Produces: `interface AgentLoopResult { status: RunStatus; model: string; tokenBudget: number; tokensSpent: number; filesRead: string[]; filesWritten: string[]; toolCalls: ToolCallLogEntry[]; gateSummary?: string; errorMessage?: string }`.
- Produces: `runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult>`.
- Consumed by: Task 11 (`commands/run.ts`).

- [ ] **Step 1: Create the fixture workspace**

```markdown
# Test Workspace

Fixture workspace used by runner integration tests. Not a real client engagement.
```

Save as `platform/runner/test/fixtures/workspace/CLAUDE.md`.

```markdown
# Task Routing

| User wants to... | Go to |
|---|---|
| Research a topic | stages/01_research/ |
```

Save as `platform/runner/test/fixtures/workspace/CONTEXT.md`.

```markdown
# Stage 01: Research

## Inputs
- `../../CLAUDE.md`
- `../../CONTEXT.md`

## Process
1. Read the context files.
2. Write one finding to `output/findings.md`.

## Outputs
- `output/findings.md`

## Verify
- `output/findings.md` exists and is non-empty.
```

Save as `platform/runner/test/fixtures/workspace/stages/01_research/CONTEXT.md`.

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgentLoop } from '../src/agentLoop.js';
import type { ChatCompletionFn, ChatCompletionResult } from '../src/openrouter.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/workspace', import.meta.url));

interface ScriptStep {
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  totalTokens: number;
}

function scriptedChat(script: ScriptStep[]): ChatCompletionFn {
  let call = 0;
  return async (): Promise<ChatCompletionResult> => {
    const step = script[call];
    call++;
    if (!step) throw new Error('Script exhausted');
    return {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: step.toolCalls?.map((tc, i) => ({
          id: `call-${call}-${i}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      },
      totalTokens: step.totalTokens,
    };
  };
}

describe('runAgentLoop', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'agent-loop-'));
    cpSync(FIXTURE_DIR, workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('completes a stage: reads context, writes output, finishes', async () => {
    const chat = scriptedChat([
      { toolCalls: [{ name: 'read_file', args: { path: 'CLAUDE.md' } }], totalTokens: 50 },
      { toolCalls: [{ name: 'read_file', args: { path: 'stages/01_research/CONTEXT.md' } }], totalTokens: 50 },
      {
        toolCalls: [
          { name: 'write_file', args: { path: 'stages/01_research/output/findings.md', content: '# Findings\n' } },
        ],
        totalTokens: 80,
      },
      {
        toolCalls: [
          { name: 'finish_stage', args: { gateSummary: 'Findings written. Verify: has at least one finding.' } },
        ],
        totalTokens: 30,
      },
    ]);

    const result = await runAgentLoop({
      workspaceRoot,
      stage: '01_research',
      apiKey: 'test-key',
      chatCompletionFn: chat,
    });

    expect(result.status).toBe('completed');
    expect(result.filesRead).toContain('CLAUDE.md');
    expect(result.filesWritten).toContain('stages/01_research/output/findings.md');
    expect(result.gateSummary).toContain('Verify');
    expect(result.tokensSpent).toBe(210);
    expect(existsSync(join(workspaceRoot, 'stages/01_research/output/findings.md'))).toBe(true);
    expect(readFileSync(join(workspaceRoot, 'stages/01_research/output/findings.md'), 'utf-8')).toBe(
      '# Findings\n'
    );
  });

  it('aborts cleanly when the token budget is exceeded', async () => {
    const chat = scriptedChat([
      { toolCalls: [{ name: 'read_file', args: { path: 'CLAUDE.md' } }], totalTokens: 100 },
      { toolCalls: [{ name: 'read_file', args: { path: 'CONTEXT.md' } }], totalTokens: 100 },
    ]);

    const result = await runAgentLoop({
      workspaceRoot,
      stage: '01_research',
      apiKey: 'test-key',
      chatCompletionFn: chat,
      tokenBudget: 150,
    });

    expect(result.status).toBe('aborted_budget');
    expect(result.tokensSpent).toBe(200);
  });
});
```

Save as `platform/runner/test/agentLoop.test.ts`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/agentLoop.test.ts`
Expected: FAIL — `Cannot find module '../src/agentLoop.js'`.

- [ ] **Step 4: Implement `agentLoop.ts`**

```typescript
import { TOOL_DEFS, createToolContext, executeTool, type ToolContext } from './tools.js';
import { TokenBudget, BudgetExceededError } from './tokenBudget.js';
import { chatCompletion as defaultChatCompletion, type ChatCompletionFn, type ChatMessage } from './openrouter.js';
import type { RunStatus, ToolCallLogEntry } from './runLog.js';

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
export const DEFAULT_TOKEN_BUDGET = 200_000;
const MAX_TOOL_ERROR_RETRIES = 3;
const MAX_ITERATIONS = 50;

export interface AgentLoopParams {
  workspaceRoot: string;
  stage: string;
  model?: string;
  apiKey: string;
  tokenBudget?: number;
  chatCompletionFn?: ChatCompletionFn;
}

export interface AgentLoopResult {
  status: RunStatus;
  model: string;
  tokenBudget: number;
  tokensSpent: number;
  filesRead: string[];
  filesWritten: string[];
  toolCalls: ToolCallLogEntry[];
  gateSummary?: string;
  errorMessage?: string;
}

function systemPrompt(stage: string): string {
  return [
    `You are executing stage "${stage}" of an ICM (Interpretable Context Methodology) pipeline.`,
    `Use list_dir and read_file to navigate: start with CLAUDE.md, then CONTEXT.md, then stages/${stage}/CONTEXT.md.`,
    "That stage CONTEXT.md tells you exactly which other files to read (its Inputs section) and what to write (its Outputs section).",
    'Load only the files the contract lists. Write your outputs with write_file.',
    'When the stage is complete, call finish_stage with a gateSummary that includes: a short summary of what you produced, and the stage\'s Verify checklist verbatim so a human reviewer can check it.',
    'Do not call finish_stage until all Output files listed in the contract have been written.',
  ].join('\n');
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const model = params.model ?? DEFAULT_MODEL;
  const tokenBudgetLimit = params.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const chat = params.chatCompletionFn ?? defaultChatCompletion;
  const budget = new TokenBudget(tokenBudgetLimit);
  const ctx: ToolContext = createToolContext(params.workspaceRoot);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(params.stage) },
    { role: 'user', content: `Run stage "${params.stage}".` },
  ];

  let toolErrorStreak = 0;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await chat({ model, messages, tools: TOOL_DEFS, apiKey: params.apiKey });
      budget.add(response.totalTokens);
      messages.push(response.message);

      const toolCalls = response.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        messages.push({
          role: 'user',
          content: 'Continue working the stage using tools, or call finish_stage when done.',
        });
        continue;
      }

      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        const result = executeTool(call.function.name, args, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: result.content,
        });

        if (!result.ok) {
          toolErrorStreak++;
          if (toolErrorStreak > MAX_TOOL_ERROR_RETRIES) {
            return finish(
              'error',
              ctx,
              budget,
              model,
              tokenBudgetLimit,
              `Too many consecutive tool errors; last error: ${result.content}`
            );
          }
        } else {
          toolErrorStreak = 0;
        }
      }

      if (ctx.finished) {
        return finish('completed', ctx, budget, model, tokenBudgetLimit);
      }
    }

    return finish('error', ctx, budget, model, tokenBudgetLimit, `Exceeded ${MAX_ITERATIONS} loop iterations without finishing`);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return finish('aborted_budget', ctx, budget, model, tokenBudgetLimit, err.message);
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    return finish('error', ctx, budget, model, tokenBudgetLimit, errorMessage);
  }
}

function finish(
  status: RunStatus,
  ctx: ToolContext,
  budget: TokenBudget,
  model: string,
  tokenBudgetLimit: number,
  errorMessage?: string
): AgentLoopResult {
  return {
    status,
    model,
    tokenBudget: tokenBudgetLimit,
    tokensSpent: budget.spent,
    filesRead: Array.from(ctx.filesRead),
    filesWritten: Array.from(ctx.filesWritten),
    toolCalls: ctx.toolCalls,
    gateSummary: ctx.gateSummary,
    errorMessage,
  };
}
```

Save as `platform/runner/src/agentLoop.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/agentLoop.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add platform/runner/src/agentLoop.ts platform/runner/test/agentLoop.test.ts platform/runner/test/fixtures
git commit -m "runner: add OpenRouter tool-calling agent loop"
```

---

### Task 11: CLI (run, status, approve, reject)

> **Amended (contract-driven):** `contracts/state-machine.md` "Stage-ordering policy"
> requires `runner run <stage>` to refuse running a stage unless every lower-numbered
> stage is `approved`, with a `--force` bypass (`contracts/README.md` "Required runner
> amendments" #2). This adds a new `stageOrder.ts` module and wires it into
> `commands/run.ts` and `cli.ts` below. `acquireLock` is now called with 3 args (`stage`
> included) per the Task 3 amendment.

**Files:**
- Create: `platform/runner/src/stageOrder.ts`
- Create: `platform/runner/src/commands/run.ts`
- Create: `platform/runner/src/commands/status.ts`
- Create: `platform/runner/src/commands/approve.ts`
- Create: `platform/runner/src/commands/reject.ts`
- Create: `platform/runner/src/cli.ts`
- Test: `platform/runner/test/stageOrder.test.ts`
- Test: `platform/runner/test/commands.test.ts`

**Interfaces:**
- Consumes: `acquireLock` (now 3-arg: `workspaceRoot, runId, stage`), `releaseLock` from `../lock.js` (Task 3, amended); `runAgentLoop` from `../agentLoop.js` (Task 10); `ChatCompletionFn` from `../openrouter.js` (Task 8); `writeRunLog`, `readLatestRunLog` from `../runLog.js` (Task 5); `commitWorkspace` from `../git.js` (Task 7); `readState`, `updateStageState` from `../state.js` (Task 6).
- Produces: `interface StageBlock { blockingStage: string; blockingStatus: string }`.
- Produces: `discoverStages(workspaceRoot: string): string[]` — directory names under `stages/` matching `^[0-9]{2}_`, lexically sorted (equivalent to numeric order given this repo's fixed 2-digit prefix convention), per `contracts/state-machine.md` "Stage discovery".
- Produces: `checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null` — the first lower-numbered stage that is not `approved`, or `null` if none block.
- Produces: `class StageOrderBlockedError extends Error { blockingStage: string; blockingStatus: string }` — message is exactly `` `Blocked: ${blockingStage} is ${blockingStatus}, must be approved first.` `` per the contract.
- Produces: `interface RunCommandDeps { chatCompletionFn?: ChatCompletionFn; force?: boolean }`.
- Produces: `runCommand(workspaceRoot: string, stage: string, deps?: RunCommandDeps): Promise<void>` — throws `StageOrderBlockedError` before acquiring the lock if stage ordering is violated and `deps.force` is not `true`.
- Produces: `statusCommand(workspaceRoot: string): void`.
- Produces: `approveCommand(workspaceRoot: string, stage: string): void`.
- Produces: `rejectCommand(workspaceRoot: string, stage: string, comment: string): void`.
- Produces: CLI entrypoint `src/cli.ts` wiring `runner run|status|approve|reject` with a `--workspace <path>` flag (defaults to `process.cwd()`), `--force` for `run`, and `--comment "<text>"` for `reject`.

- [ ] **Step 1: Write the failing tests for `stageOrder.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverStages, checkStageOrder } from '../src/stageOrder.js';
import { updateStageState } from '../src/state.js';

describe('stageOrder', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'stage-order-'));
    mkdirSync(join(workspaceRoot, 'stages', '01_research'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '02_analysis'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '03_report'), { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('discovers stage directories in numeric order', () => {
    expect(discoverStages(workspaceRoot)).toEqual(['01_research', '02_analysis', '03_report']);
  });

  it('does not block the first stage', () => {
    expect(checkStageOrder(workspaceRoot, '01_research')).toBeNull();
  });

  it('blocks a later stage when an earlier one is pending', () => {
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toEqual({
      blockingStage: '01_research',
      blockingStatus: 'pending',
    });
  });

  it('does not block once the earlier stage is approved', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toBeNull();
  });

  it('blocks on the first unapproved stage, even if a later one is further along', () => {
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    updateStageState(workspaceRoot, '02_analysis', { status: 'awaiting_review' });
    expect(checkStageOrder(workspaceRoot, '03_report')).toEqual({
      blockingStage: '02_analysis',
      blockingStatus: 'awaiting_review',
    });
  });
});
```

Save as `platform/runner/test/stageOrder.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/stageOrder.test.ts`
Expected: FAIL — `Cannot find module '../src/stageOrder.js'`.

- [ ] **Step 3: Implement `stageOrder.ts`**

```typescript
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from './state.js';

export interface StageBlock {
  blockingStage: string;
  blockingStatus: string;
}

export function discoverStages(workspaceRoot: string): string[] {
  return readdirSync(join(workspaceRoot, 'stages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9]{2}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null {
  const state = readState(workspaceRoot);
  for (const candidate of discoverStages(workspaceRoot)) {
    if (candidate >= stage) break;
    const status = state.stages[candidate]?.status ?? 'pending';
    if (status !== 'approved') {
      return { blockingStage: candidate, blockingStatus: status };
    }
  }
  return null;
}
```

Save as `platform/runner/src/stageOrder.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/stageOrder.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Write the failing tests for the CLI commands**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, StageOrderBlockedError } from '../src/commands/run.js';
import { statusCommand } from '../src/commands/status.js';
import { approveCommand } from '../src/commands/approve.js';
import { rejectCommand } from '../src/commands/reject.js';
import { readState, updateStageState } from '../src/state.js';
import type { ChatCompletionFn, ChatCompletionResult } from '../src/openrouter.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/workspace', import.meta.url));

function scriptedChat(
  script: Array<{ toolCalls?: Array<{ name: string; args: Record<string, unknown> }>; totalTokens: number }>
): ChatCompletionFn {
  let call = 0;
  return async (): Promise<ChatCompletionResult> => {
    const step = script[call];
    call++;
    if (!step) throw new Error('Script exhausted');
    return {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: step.toolCalls?.map((tc, i) => ({
          id: `call-${call}-${i}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      },
      totalTokens: step.totalTokens,
    };
  };
}

describe('CLI commands', () => {
  let workspaceRoot: string;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'commands-'));
    cpSync(FIXTURE_DIR, workspaceRoot, { recursive: true });
    mkdirSync(join(workspaceRoot, 'stages', '02_analysis'), { recursive: true });
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
    execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '-m', 'seed'], { cwd: workspaceRoot });
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    process.env.OPENROUTER_API_KEY = originalApiKey;
  });

  it('runCommand completes a stage and moves it to awaiting_review', async () => {
    const chat = scriptedChat([
      { toolCalls: [{ name: 'read_file', args: { path: 'CLAUDE.md' } }], totalTokens: 10 },
      {
        toolCalls: [
          { name: 'write_file', args: { path: 'stages/01_research/output/findings.md', content: '# Findings\n' } },
        ],
        totalTokens: 10,
      },
      { toolCalls: [{ name: 'finish_stage', args: { gateSummary: 'Done. Verify: ok.' } }], totalTokens: 10 },
    ]);

    await runCommand(workspaceRoot, '01_research', { chatCompletionFn: chat });

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('awaiting_review');
    expect(existsSync(join(workspaceRoot, 'stages/01_research/output/findings.md'))).toBe(true);
  });

  it('runCommand refuses to run a later stage when an earlier stage is not approved', async () => {
    const chat = scriptedChat([]);
    let caught: unknown;
    try {
      await runCommand(workspaceRoot, '02_analysis', { chatCompletionFn: chat });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StageOrderBlockedError);
    expect((caught as Error).message).toBe('Blocked: 01_research is pending, must be approved first.');
  });

  it('runCommand --force bypasses stage ordering', async () => {
    const chat = scriptedChat([
      { toolCalls: [{ name: 'finish_stage', args: { gateSummary: 'Done. Verify: ok.' } }], totalTokens: 10 },
    ]);

    await runCommand(workspaceRoot, '02_analysis', { chatCompletionFn: chat, force: true });

    const state = readState(workspaceRoot);
    expect(state.stages['02_analysis'].status).toBe('awaiting_review');
  });

  it('runCommand proceeds once the earlier stage is approved', async () => {
    updateStageState(workspaceRoot, '01_research', { status: 'approved' });
    const chat = scriptedChat([
      { toolCalls: [{ name: 'finish_stage', args: { gateSummary: 'Done. Verify: ok.' } }], totalTokens: 10 },
    ]);

    await runCommand(workspaceRoot, '02_analysis', { chatCompletionFn: chat });

    const state = readState(workspaceRoot);
    expect(state.stages['02_analysis'].status).toBe('awaiting_review');
  });

  it('approveCommand marks a stage approved and commits', () => {
    approveCommand(workspaceRoot, '01_research');
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
  });

  it('rejectCommand records the comment without approving', () => {
    rejectCommand(workspaceRoot, '01_research', 'too shallow');
    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('rejected');
    expect(state.stages['01_research'].comment).toBe('too shallow');
  });

  it('statusCommand runs without throwing when no runs exist yet', () => {
    expect(() => statusCommand(workspaceRoot)).not.toThrow();
  });
});
```

Save as `platform/runner/test/commands.test.ts`.

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/commands.test.ts`
Expected: FAIL — `Cannot find module '../src/commands/run.js'`.

- [ ] **Step 7: Implement `commands/run.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { acquireLock, releaseLock } from '../lock.js';
import { runAgentLoop } from '../agentLoop.js';
import type { ChatCompletionFn } from '../openrouter.js';
import { writeRunLog } from '../runLog.js';
import { commitWorkspace } from '../git.js';
import { updateStageState } from '../state.js';
import { checkStageOrder } from '../stageOrder.js';

export interface RunCommandDeps {
  chatCompletionFn?: ChatCompletionFn;
  force?: boolean;
}

export class StageOrderBlockedError extends Error {
  constructor(public readonly blockingStage: string, public readonly blockingStatus: string) {
    super(`Blocked: ${blockingStage} is ${blockingStatus}, must be approved first.`);
    this.name = 'StageOrderBlockedError';
  }
}

export async function runCommand(workspaceRoot: string, stage: string, deps: RunCommandDeps = {}): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!deps.force) {
    const block = checkStageOrder(workspaceRoot, stage);
    if (block) {
      throw new StageOrderBlockedError(block.blockingStage, block.blockingStatus);
    }
  }

  const runId = randomUUID();
  acquireLock(workspaceRoot, runId, stage);
  const startedAt = new Date().toISOString();

  try {
    const result = await runAgentLoop({
      workspaceRoot,
      stage,
      apiKey,
      chatCompletionFn: deps.chatCompletionFn,
    });
    const endedAt = new Date().toISOString();

    commitWorkspace(workspaceRoot, `stage ${stage}: run ${runId} (${result.status})`);

    writeRunLog(workspaceRoot, {
      runId,
      stage,
      model: result.model,
      startedAt,
      endedAt,
      status: result.status,
      filesRead: result.filesRead,
      filesWritten: result.filesWritten,
      toolCalls: result.toolCalls,
      tokensSpent: result.tokensSpent,
      tokenBudget: result.tokenBudget,
      gateSummary: result.gateSummary,
      errorMessage: result.errorMessage,
    });

    updateStageState(workspaceRoot, stage, {
      status: result.status === 'completed' ? 'awaiting_review' : 'pending',
      lastRunId: runId,
    });

    console.log(`Run ${runId} (${stage}): ${result.status}`);
    if (result.gateSummary) {
      console.log('\n--- Gate summary ---\n' + result.gateSummary);
    }
    if (result.errorMessage) {
      console.error('Error: ' + result.errorMessage);
    }
  } finally {
    releaseLock(workspaceRoot);
  }
}
```

Save as `platform/runner/src/commands/run.ts`.

- [ ] **Step 8: Implement `commands/status.ts`**

```typescript
import { readState } from '../state.js';
import { readLatestRunLog } from '../runLog.js';

export function statusCommand(workspaceRoot: string): void {
  const state = readState(workspaceRoot);
  const stages = Object.keys(state.stages);

  if (stages.length === 0) {
    console.log('No runs recorded yet.');
    return;
  }

  for (const stage of stages.sort()) {
    const stageState = state.stages[stage];
    const log = readLatestRunLog(workspaceRoot, stage);
    const suffix = log ? ` (last run ${log.runId}, ${log.tokensSpent} tokens)` : '';
    console.log(`${stage}: ${stageState.status}${suffix}`);
    if (stageState.comment) {
      console.log(`  comment: ${stageState.comment}`);
    }
  }
}
```

Save as `platform/runner/src/commands/status.ts`.

- [ ] **Step 9: Implement `commands/approve.ts` and `commands/reject.ts`**

```typescript
import { commitWorkspace } from '../git.js';
import { updateStageState } from '../state.js';

export function approveCommand(workspaceRoot: string, stage: string): void {
  commitWorkspace(workspaceRoot, `stage ${stage}: approved`);
  updateStageState(workspaceRoot, stage, { status: 'approved' });
  console.log(`${stage}: approved`);
}
```

Save as `platform/runner/src/commands/approve.ts`.

```typescript
import { updateStageState } from '../state.js';

export function rejectCommand(workspaceRoot: string, stage: string, comment: string): void {
  updateStageState(workspaceRoot, stage, { status: 'rejected', comment });
  console.log(`${stage}: rejected — ${comment}`);
}
```

Save as `platform/runner/src/commands/reject.ts`.

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/commands.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 11: Implement the CLI entrypoint `cli.ts`**

```typescript
#!/usr/bin/env node
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { approveCommand } from './commands/approve.js';
import { rejectCommand } from './commands/reject.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  runner run <stage> [--workspace <path>] [--force]',
      '  runner status [--workspace <path>]',
      '  runner approve <stage> [--workspace <path>]',
      '  runner reject <stage> --comment "<text>" [--workspace <path>]',
    ].join('\n')
  );
  process.exit(1);
}

function parseWorkspaceFlag(args: string[]): { workspaceRoot: string; rest: string[] } {
  const idx = args.indexOf('--workspace');
  if (idx === -1) {
    return { workspaceRoot: process.cwd(), rest: args };
  }
  const workspaceRoot = args[idx + 1];
  if (!workspaceRoot) usage();
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { workspaceRoot, rest };
}

function parseForceFlag(args: string[]): { force: boolean; rest: string[] } {
  const idx = args.indexOf('--force');
  if (idx === -1) {
    return { force: false, rest: args };
  }
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  return { force: true, rest };
}

function parseCommentFlag(args: string[]): { comment: string; rest: string[] } {
  const idx = args.indexOf('--comment');
  if (idx === -1 || !args[idx + 1]) usage();
  const comment = args[idx + 1];
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { comment, rest };
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { workspaceRoot, rest } = parseWorkspaceFlag(rawArgs);

  switch (command) {
    case 'run': {
      const { force, rest: rest2 } = parseForceFlag(rest);
      const [stage] = rest2;
      if (!stage) usage();
      await runCommand(workspaceRoot, stage, { force });
      break;
    }
    case 'status': {
      statusCommand(workspaceRoot);
      break;
    }
    case 'approve': {
      const [stage] = rest;
      if (!stage) usage();
      approveCommand(workspaceRoot, stage);
      break;
    }
    case 'reject': {
      const { comment, rest: rest2 } = parseCommentFlag(rest);
      const [stage] = rest2;
      if (!stage) usage();
      rejectCommand(workspaceRoot, stage, comment);
      break;
    }
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

Save as `platform/runner/src/cli.ts`.

- [ ] **Step 12: Run the full test suite and typecheck**

Run: `cd platform/runner && npm run typecheck && npm test`
Expected: typecheck passes; all test files pass (should be ~40 tests total across Tasks 1-11).

- [ ] **Step 13: Manually verify the CLI wires together**

Run:
```bash
cd platform/runner
npx tsx src/cli.ts status --workspace ./test/fixtures/workspace
```
Expected: prints `No runs recorded yet.` (no crash, confirms `cli.ts` → `statusCommand` wiring works end to end).

- [ ] **Step 14: Commit**

```bash
git add platform/runner/src/stageOrder.ts platform/runner/src/commands platform/runner/src/cli.ts platform/runner/test/stageOrder.test.ts platform/runner/test/commands.test.ts
git commit -m "runner: add CLI (run/status/approve/reject) with stage-ordering enforcement"
```

---

### Task 12: Docker packaging and manual smoke test

**Files:**
- Create: `platform/runner/Dockerfile`
- Create: `platform/runner/.env.example`
- Create: `platform/runner/.dockerignore`

**Interfaces:**
- Produces: a container image that runs the CLI against a mounted workspace volume — the container-mount-as-jail boundary required by the design doc and mvp-spec §1.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
dist
*.log
```

Save as `platform/runner/.dockerignore`.

- [ ] **Step 2: Create `.env.example`**

```
OPENROUTER_API_KEY=
```

Save as `platform/runner/.env.example`.

- [ ] **Step 3: Create the `Dockerfile`**

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev=false
COPY tsconfig.json ./
COPY src ./src

ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
CMD ["status", "--workspace", "/workspace"]
```

Save as `platform/runner/Dockerfile`.

- [ ] **Step 4: Build the image**

Run: `cd platform/runner && docker build -t icm-runner .`
Expected: image builds successfully (`Successfully tagged icm-runner:latest` or equivalent BuildKit success output).

- [ ] **Step 5: Smoke-test the container against the fixture workspace**

Run:
```bash
cd platform/runner
docker run --rm -v "$(pwd)/test/fixtures/workspace:/workspace" icm-runner status --workspace /workspace
```
Expected: prints `No runs recorded yet.` — confirms the container mounts a workspace volume and the jail-relative paths work the same way inside the container as they do on the host.

- [ ] **Step 6: Manual end-to-end smoke test (requires a real OpenRouter API key; not part of automated CI)**

Run against a disposable copy of `examples/meridian-support-automation` (never the tracked copy, since `runCommand` commits to git):
```bash
cp -r examples/meridian-support-automation /tmp/meridian-smoke-test
cd /tmp/meridian-smoke-test && git init -q && git add -A && git commit -q -m seed
cd /home/elroy/projects/agent-design/icm-scaffold/platform/runner
OPENROUTER_API_KEY=<real key> npx tsx src/cli.ts run 01_research --workspace /tmp/meridian-smoke-test
npx tsx src/cli.ts status --workspace /tmp/meridian-smoke-test
```
Expected: the run completes (or reports a clear `aborted_budget`/`error` status), `01_research: awaiting_review` (or the appropriate status) appears, and `git -C /tmp/meridian-smoke-test log --oneline` shows the stage-run commit. Delete `/tmp/meridian-smoke-test` afterward.

- [ ] **Step 7: Commit**

```bash
git add platform/runner/Dockerfile platform/runner/.env.example platform/runner/.dockerignore
git commit -m "runner: add Docker packaging"
```

---

## Definition of done

- `cd platform/runner && npm run typecheck && npm test` passes with no failures.
- `docker build` succeeds and the container smoke test (Task 12, Step 5) prints the expected status output.
- The manual end-to-end smoke test (Task 12, Step 6) has been run at least once against a real OpenRouter key, and its outcome (success or a documented failure) is reported back before this sub-project is considered validated — this is M0 ("dogfood") from `docs/mvp-spec.md`'s validation milestones, scoped to a single stage.
