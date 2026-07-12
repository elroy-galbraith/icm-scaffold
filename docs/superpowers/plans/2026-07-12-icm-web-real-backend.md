# ICM Web Real Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `platform/web/server/`, a thin Node/Express backend implementing every
path in `contracts/openapi.yaml` against a real ICM workspace — reads come straight from
`.runner/` files and git (ported from the already-correct read side of
`platform/web/mock-server/`), writes for run/approve/reject shell out to the real
`platform/runner` CLI — then prove it end to end with the actual frontend and a real
OpenRouter call.

**Architecture:** Port `platform/web/mock-server/src/{state,git,pipeline}.ts` into the
new package verbatim (they already read real file formats, nothing mock about them).
Replace the mock server's `simulate.ts` with a new `runnerCli.ts` that shells out to
`platform/runner`'s CLI via `npm --prefix <runner-dir> run runner -- <args>`. A new
`workspace.ts` seeds a runnable test workspace by merging this repo's real stage
contracts (`stages/*/CONTEXT.md`, `references/`, `_config/conventions.md`) with
`examples/meridian-support-automation`'s configured engagement data, since the example
ships finished output but not the contracts that produced it.

**Tech Stack:** TypeScript (Node ≥20, ESM, `tsx`, `vitest`), Express, `ajv`/`ajv-formats`
for schema validation, `cors`, `supertest` for route tests. Same stack as
`platform/web/mock-server`, no new dependencies (the runner CLI is invoked via
`node:child_process`, no subprocess-management library needed).

## Global Constraints

- `contracts/openapi.yaml` and `contracts/schemas/*.json` are frozen — every response
  shape in this plan matches them exactly; do not modify those files.
- No changes to `platform/runner/` or `platform/web/frontend/` source. The frontend's
  `vite.config.ts` proxies `/api` to `http://localhost:4000` — the new server must
  listen on port 4000 (overridable via `PORT`) so the frontend needs zero changes.
  Do not run `platform/web/mock-server` at the same time as `platform/web/server`;
  they'd collide on the port.
- Auth: none. Per the OpenAPI spec, "Auth: none in MVP mocks" — no endpoint shapes
  change here.
- `platform/runner/src/commands/approve.ts` and `reject.ts` do **not** guard current
  stage status themselves — the HTTP layer must enforce the contract's 409
  ("not awaiting_review") before invoking them.
- The seeded test workspace defaults to `<os.tmpdir()>/icm-web-live-workspace`,
  overridable via a `WORKSPACE_ROOT` env var, and is rebuilt from scratch on every
  server start (matches the mock server's `seedWorkspace` pattern — this is a dev/test
  tool, not the deploy artifact).
- `OPENROUTER_API_KEY` for real runs comes from `platform/runner/.env` (gitignored,
  already present) — never hardcode or print it.

---

### Task 1: Scaffold the `platform/web/server` package

**Files:**
- Create: `platform/web/server/package.json`
- Create: `platform/web/server/tsconfig.json`
- Create: `platform/web/server/vitest.config.ts`
- Create: `platform/web/server/src/version.ts`
- Test: `platform/web/server/test/version.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a working `npm install`, `npm test`, `npm run typecheck` in
  `platform/web/server/`, which every later task in this plan relies on.

- [ ] **Step 1: Create the package directory and package.json**

```bash
mkdir -p platform/web/server/src/routes platform/web/server/test/routes platform/web/server/src/assets
```

```json
{
  "name": "icm-web-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.1",
    "cors": "^2.8.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Save as `platform/web/server/package.json`.

- [ ] **Step 2: Create tsconfig.json and vitest.config.ts**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Save as `platform/web/server/tsconfig.json`.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000,
  },
});
```

Save as `platform/web/server/vitest.config.ts`.

- [ ] **Step 3: Install dependencies**

Run: `cd platform/web/server && npm install`
Expected: creates `node_modules/` and `package-lock.json`, exits 0.

- [ ] **Step 4: Add the scaffolding smoke test and version module**

```ts
export const ICM_WEB_SERVER_VERSION = '0.1.0';
```

Save as `platform/web/server/src/version.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { ICM_WEB_SERVER_VERSION } from '../src/version.js';

describe('scaffolding smoke test', () => {
  it('exposes a version string', () => {
    expect(ICM_WEB_SERVER_VERSION).toBe('0.1.0');
  });
});
```

Save as `platform/web/server/test/version.test.ts`.

- [ ] **Step 5: Run typecheck and tests**

Run: `cd platform/web/server && npm run typecheck && npm test`
Expected: both exit 0; the test run shows 1 passed test.

- [ ] **Step 6: Gitignore the new package's build artifacts**

Add these two lines to `.gitignore`, next to the existing
`platform/web/mock-server/...` lines:

```
platform/web/server/node_modules/
platform/web/server/dist/
```

- [ ] **Step 7: Commit**

```bash
git add platform/web/server/package.json platform/web/server/package-lock.json \
  platform/web/server/tsconfig.json platform/web/server/vitest.config.ts \
  platform/web/server/src/version.ts platform/web/server/test/version.test.ts \
  .gitignore
git commit -m "web-server: scaffold icm-web-server TypeScript package"
```

---

### Task 2: Port the data layer (`state.ts`)

**Files:**
- Create: `platform/web/server/src/state.ts` (verbatim copy)
- Test: `platform/web/server/test/state.test.ts` (verbatim copy)

**Interfaces:**
- Consumes: `contracts/schemas/{workspace-state,lock,run-log}.schema.json` (unchanged
  location — both packages sit at the same depth under the repo root:
  `platform/web/<pkg>/src/`).
- Produces: `readState`, `writeState`, `updateStageState`, `readLock`, `writeLock`,
  `clearLock`, `writeRunLog`, `readRunLog`, and the types `StageStatus`, `StageState`,
  `WorkspaceState`, `RunStatus`, `ToolCallLogEntry`, `RunLog`, `LockInfo`,
  `SchemaValidationError` — every later task that reads or writes workspace state
  imports from here.

This file is identical between the mock server and the real backend: it reads/writes
the real `.runner/state.json`, `.runner.lock`, and `.runner/runs/<id>.json` files
against the frozen schemas. Nothing about it is mock-specific, so it's a straight copy.

- [ ] **Step 1: Copy the file and its test verbatim**

```bash
cp platform/web/mock-server/src/state.ts platform/web/server/src/state.ts
cp platform/web/mock-server/test/state.test.ts platform/web/server/test/state.test.ts
```

- [ ] **Step 2: Run the tests**

Run: `cd platform/web/server && npm test -- state.test.ts`
Expected: all tests pass (same suite that already passes in `mock-server`).

- [ ] **Step 3: Commit**

```bash
git add platform/web/server/src/state.ts platform/web/server/test/state.test.ts
git commit -m "web-server: port state.ts (workspace state/lock/run-log I/O)"
```

---

### Task 3: Port the git layer (`git.ts`)

**Files:**
- Create: `platform/web/server/src/git.ts` (verbatim copy)
- Test: `platform/web/server/test/git.test.ts` (verbatim copy)

**Interfaces:**
- Produces: `commitWorkspace`, `currentHead`, `getTree`, `getDiff`, `getLog`,
  `InvalidRefError`, and the types `TreeEntry`, `LogEntry`, `DiffResult`.

Also mock-independent: shells out to real `git` against `workspaceRoot`, including the
hardened `assertSafeRef` check (rejects a `ref` starting with `-` to prevent it being
parsed as a `git diff` option).

- [ ] **Step 1: Copy the file and its test verbatim**

```bash
cp platform/web/mock-server/src/git.ts platform/web/server/src/git.ts
cp platform/web/mock-server/test/git.test.ts platform/web/server/test/git.test.ts
```

- [ ] **Step 2: Run the tests**

Run: `cd platform/web/server && npm test -- git.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add platform/web/server/src/git.ts platform/web/server/test/git.test.ts
git commit -m "web-server: port git.ts (tree/diff/log/commit)"
```

---

### Task 4: Port the pipeline view (`pipeline.ts`)

**Files:**
- Create: `platform/web/server/src/pipeline.ts` (verbatim copy)
- Test: `platform/web/server/test/pipeline.test.ts` (verbatim copy)

**Interfaces:**
- Consumes: `readState`, `readLock`, `readRunLog` from `./state.js` (Task 2);
  `listStageNames` from `./workspace.js` (Task 5 — not yet created; that's fine, this
  task only copies the file, `npm test -- pipeline.test.ts` doesn't touch the routes
  that need `workspace.js`, and TypeScript will resolve the import once Task 5 adds
  it. `npm run typecheck` will fail until Task 5 lands — that's expected and checked
  again at the end of Task 5).
- Produces: `buildPipelineView(workspaceRoot: string): PipelineView`, and the types
  `PipelineView`, `StageView`, `LastRunSummary` — the pipeline route (Task 6) calls
  this directly.

- [ ] **Step 1: Copy the file and its test verbatim**

```bash
cp platform/web/mock-server/src/pipeline.ts platform/web/server/src/pipeline.ts
cp platform/web/mock-server/test/pipeline.test.ts platform/web/server/test/pipeline.test.ts
```

- [ ] **Step 2: Run the pipeline test in isolation**

Run: `cd platform/web/server && npm test -- pipeline.test.ts`
Expected: fails to resolve `./workspace.js` (doesn't exist yet). This is expected —
`pipeline.test.ts` imports `buildPipelineView` from `../src/pipeline.js`, which in
turn imports `listStageNames` from `./workspace.js`. Proceed to Task 5 immediately;
this task's tests are verified there.

- [ ] **Step 3: Commit**

```bash
git add platform/web/server/src/pipeline.ts platform/web/server/test/pipeline.test.ts
git commit -m "web-server: port pipeline.ts (Pipeline view assembly)"
```

---

### Task 5: Real workspace seed (`workspace.ts`)

**Files:**
- Create: `platform/web/server/src/assets/workspace-claude.md`
- Create: `platform/web/server/src/workspace.ts`
- Test: `platform/web/server/test/workspace.test.ts`

**Interfaces:**
- Consumes: `readState` and the type `StageStatus` from `./state.js` (Task 2); reads
  the real repo's `stages/`, `_config/conventions.md`, `CONTEXT.md`, and
  `examples/meridian-support-automation/` at runtime via paths resolved from
  `import.meta.url`.
- Produces: `WorkspaceConfig { workspaceRoot: string }`, `STAGE_NAME_PATTERN`,
  `listStageNames(workspaceRoot: string): string[]`,
  `checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null`, the type
  `StageBlock { blockingStage: string; blockingStatus: StageStatus }`, and
  `seedRealWorkspace(workspaceRoot: string): void`. `pipeline.ts` (Task 4) already
  depends on `listStageNames`; `routes/stageActions.ts` (Task 8) will depend on
  `checkStageOrder` and `STAGE_NAME_PATTERN`; `server.ts` (Task 9) depends on
  `seedRealWorkspace` and `WorkspaceConfig`.

The runner's agent loop tells the model to read `CLAUDE.md`, then `CONTEXT.md`, then
the stage's own `CONTEXT.md` (see `platform/runner/src/agentLoop.ts`'s `systemPrompt`).
`examples/meridian-support-automation` doesn't include contracts (its README explains
why — they're identical across engagements and live once at the repo root), so the
seed merges: this repo's real `stages/*/CONTEXT.md` + `references/` +
`_config/conventions.md`, with the example's `_config/voice.md`, `shared/*`, and
`stages/{01_research,02_analysis}/output/*` (leaving `03_report` unbuilt, i.e.
pending). The workspace's `CLAUDE.md` is a **curated static copy** of just this repo's
Layer-0 "Workspace Identity" section — not a live copy of the repo's own `CLAUDE.md`,
which also contains a "Worktree identity" override telling an agent it should *not* do
ICM report-pipeline work. Copying that verbatim into the seeded workspace would
confuse the very agent we're about to run.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedRealWorkspace, listStageNames, checkStageOrder } from '../src/workspace.js';
import { readState } from '../src/state.js';

describe('seedRealWorkspace', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = join(mkdtempSync(join(tmpdir(), 'real-seed-')), 'workspace');
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('layers real stage contracts over the Meridian example, leaving 03_report pending', () => {
    seedRealWorkspace(workspaceRoot);

    // Contracts came from the repo root, not the example.
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'CONTEXT.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'references', 'report-structure.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, '_config', 'conventions.md'))).toBe(true);

    // Engagement data and completed output came from the example.
    const voice = readFileSync(join(workspaceRoot, '_config', 'voice.md'), 'utf-8');
    expect(voice.length).toBeGreaterThan(0);
    expect(existsSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'))).toBe(true);
    expect(existsSync(join(workspaceRoot, 'stages', '02_analysis', 'output', 'insights.md'))).toBe(true);

    // 03_report has no pre-baked output — it's the pending stage.
    expect(existsSync(join(workspaceRoot, 'stages', '03_report', 'output', 'report.md'))).toBe(false);

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
    expect(state.stages['02_analysis'].status).toBe('approved');
    expect(state.stages['03_report']).toBeUndefined();
  });

  it('writes a workspace CLAUDE.md without the worktree override', () => {
    seedRealWorkspace(workspaceRoot);
    const claudeMd = readFileSync(join(workspaceRoot, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('Workspace Identity (Layer 0)');
    expect(claudeMd).not.toContain('Worktree identity');
  });

  it('git-inits and commits the seed', () => {
    seedRealWorkspace(workspaceRoot);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
    expect(status.trim()).toBe('');
  });

  it('is idempotent — reseeding a dirty workspace resets it', () => {
    seedRealWorkspace(workspaceRoot);
    execFileSync('git', ['rm', '-r', '--cached', 'stages/01_research'], { cwd: workspaceRoot });
    seedRealWorkspace(workspaceRoot);
    expect(existsSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'))).toBe(true);
  });
});

describe('listStageNames', () => {
  it('returns [] for a workspace with no stages/ dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-stages-'));
    expect(listStageNames(empty)).toEqual([]);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('checkStageOrder', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = join(mkdtempSync(join(tmpdir(), 'stage-order-')), 'workspace');
    seedRealWorkspace(workspaceRoot);
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns null when every earlier stage is approved', () => {
    expect(checkStageOrder(workspaceRoot, '03_report')).toBeNull();
  });

  it('returns null for 02_analysis too, since its only earlier stage (01_research) is approved', () => {
    expect(checkStageOrder(workspaceRoot, '02_analysis')).toBeNull();
  });
});
```

Save as `platform/web/server/test/workspace.test.ts`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd platform/web/server && npm test -- workspace.test.ts`
Expected: FAIL — `Cannot find module '../src/workspace.js'`.

- [ ] **Step 3: Write the CLAUDE.md asset**

```markdown
# Workspace Identity (Layer 0)

You are the orchestrating agent for an **ICM workspace**: a multi-stage pipeline where
folder structure is the architecture. This workspace produces **client-ready reports**
through three stages: research → analysis → report.

## How this workspace works

- `stages/` contains numbered stage folders. The number prefix is the execution order.
- Each stage folder has:
  - `CONTEXT.md` — the stage contract (Inputs, Process, Outputs, Verify)
  - `references/` — stage-specific reference material (Layer 3)
  - `output/` — where the stage writes its artifacts (Layer 4)
- `_config/` holds global reference material (voice, conventions) that stage contracts cite.
- `shared/` holds cross-stage resources (client brief, glossary).
- Root `CONTEXT.md` is the routing table: read it to map a user request to a stage.

## Operating rules

1. **Route first.** On any task request, read root `CONTEXT.md` and identify the stage.
2. **Load only the contract's Inputs.** Read the stage's `CONTEXT.md`, then load exactly
   the files its Inputs section lists. Do not read other stages' materials.
3. **Write outputs only to the current stage's `output/`.** Use the filenames the
   contract specifies.
4. **Stop at the review gate.** After completing a stage, tell the user what was written
   and where, then stop. Do not start the next stage unless asked.
5. **Respect human edits.** The next stage reads whatever is on disk. If output files were
   edited since you wrote them, treat the edited version as authoritative.
6. **Run the Verify section** of the contract (if present) before declaring a stage done.
7. **Edit-source principle.** If the user repeatedly corrects the same thing in outputs,
   propose a patch to the relevant Layer 3 file (voice guide, contract) instead of
   re-fixing outputs.

## Setup mode

If `shared/client-brief.md` still contains placeholder text, offer to run setup:
walk the user through `setup/questionnaire.md` and write their answers into
`shared/client-brief.md` and `_config/voice.md` before running any stage.
```

Save as `platform/web/server/src/assets/workspace-claude.md`. (This is a curated copy
of this repo's `CLAUDE.md` lines 1-38 only — the Layer-0 section — deliberately
excluding everything from `## Worktree identity` onward.)

- [ ] **Step 4: Write workspace.ts**

```ts
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readState, type StageStatus } from './state.js';

export interface WorkspaceConfig {
  workspaceRoot: string;
}

export interface StageBlock {
  blockingStage: string;
  blockingStatus: StageStatus;
}

export const STAGE_NAME_PATTERN = /^[0-9]{2}_[a-z0-9_]+$/;

// platform/web/server/src/workspace.ts -> repo root is four levels up.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples', 'meridian-support-automation');
const WORKSPACE_CLAUDE_MD = readFileSync(
  fileURLToPath(new URL('./assets/workspace-claude.md', import.meta.url)),
  'utf-8'
);

const APPROVED_ON_SEED = ['01_research', '02_analysis'];

export function listStageNames(workspaceRoot: string): string[] {
  const stagesDir = join(workspaceRoot, 'stages');
  if (!existsSync(stagesDir)) return [];
  return readdirSync(stagesDir)
    .filter((name) => STAGE_NAME_PATTERN.test(name) && statSync(join(stagesDir, name)).isDirectory())
    .sort();
}

export function checkStageOrder(workspaceRoot: string, stage: string): StageBlock | null {
  const state = readState(workspaceRoot);
  for (const candidate of listStageNames(workspaceRoot)) {
    if (candidate >= stage) break;
    const status = state.stages[candidate]?.status ?? 'pending';
    if (status !== 'approved') {
      return { blockingStage: candidate, blockingStatus: status };
    }
  }
  return null;
}

export function seedRealWorkspace(workspaceRoot: string): void {
  if (existsSync(workspaceRoot)) {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
  mkdirSync(workspaceRoot, { recursive: true });

  // 1. Real stage contracts (CONTEXT.md + references/) from the repo root.
  cpSync(join(REPO_ROOT, 'stages'), join(workspaceRoot, 'stages'), { recursive: true });
  cpSync(join(REPO_ROOT, 'CONTEXT.md'), join(workspaceRoot, 'CONTEXT.md'));

  // 2. Configured engagement data + completed output from the worked example.
  mkdirSync(join(workspaceRoot, '_config'), { recursive: true });
  cpSync(join(REPO_ROOT, '_config', 'conventions.md'), join(workspaceRoot, '_config', 'conventions.md'));
  cpSync(join(EXAMPLE_DIR, '_config', 'voice.md'), join(workspaceRoot, '_config', 'voice.md'));
  cpSync(join(EXAMPLE_DIR, 'shared'), join(workspaceRoot, 'shared'), { recursive: true });
  for (const stage of APPROVED_ON_SEED) {
    cpSync(
      join(EXAMPLE_DIR, 'stages', stage, 'output'),
      join(workspaceRoot, 'stages', stage, 'output'),
      { recursive: true }
    );
  }
  // 03_report/output stays whatever `stages/` (step 1) shipped — empty but for
  // .gitkeep — so it's the pending stage.

  // 3. A workspace CLAUDE.md curated for this seed (see assets/workspace-claude.md).
  writeFileSync(join(workspaceRoot, 'CLAUDE.md'), WORKSPACE_CLAUDE_MD);

  // 4. Stage state: earlier stages approved, 03_report absent (= pending, per
  // contracts/state-machine.md's "a stage absent from state.json is pending" rule).
  const now = new Date().toISOString();
  const stages: Record<string, { status: StageStatus; updatedAt: string }> = {};
  for (const name of APPROVED_ON_SEED) {
    stages[name] = { status: 'approved', updatedAt: now };
  }
  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(join(workspaceRoot, '.runner', 'state.json'), JSON.stringify({ stages }, null, 2));

  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'icm-web-server@icm.local'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'ICM Web Server'], { cwd: workspaceRoot });
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'Seed live test workspace from repo contracts + Meridian example'], {
    cwd: workspaceRoot,
  });
}
```

Save as `platform/web/server/src/workspace.ts`.

- [ ] **Step 5: Run the workspace and pipeline tests**

Run: `cd platform/web/server && npm test -- workspace.test.ts pipeline.test.ts`
Expected: all tests pass, including Task 4's `pipeline.test.ts` (its `workspace.js`
import now resolves).

- [ ] **Step 6: Typecheck the whole package**

Run: `cd platform/web/server && npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add platform/web/server/src/assets/workspace-claude.md platform/web/server/src/workspace.ts \
  platform/web/server/test/workspace.test.ts
git commit -m "web-server: add real workspace seed (repo contracts + Meridian example)"
```

---

### Task 6: Read-only routes and `app.ts`

**Files:**
- Create: `platform/web/server/src/routes/pipeline.ts`
- Create: `platform/web/server/src/routes/runs.ts`
- Create: `platform/web/server/src/routes/files.ts`
- Create: `platform/web/server/src/routes/treeDiffLog.ts`
- Create: `platform/web/server/src/app.ts`
- Create: `platform/web/server/test/helpers/seedTestWorkspace.ts`
- Test: `platform/web/server/test/routes/pipeline.test.ts`
- Test: `platform/web/server/test/routes/runs.test.ts`
- Test: `platform/web/server/test/routes/files.test.ts`
- Test: `platform/web/server/test/routes/treeDiffLog.test.ts`

**Interfaces:**
- Consumes: `buildPipelineView` (Task 4); `readRunLog`, `readLock`, `writeState`,
  `writeLock`, `writeRunLog` (Task 2); `getTree`, `getDiff`, `getLog`, `InvalidRefError`,
  `commitWorkspace` (Task 3); `WorkspaceConfig` (Task 5).
- Produces: `createPipelineRouter`, `createRunsRouter`, `createFilesRouter`,
  `createTreeDiffLogRouter` (each `(config: WorkspaceConfig) => Router`), and
  `createApp(config: WorkspaceConfig, options?: { runnerCli?: RunnerCli }) => Express`
  — Task 8 modifies `createApp` to also mount the stage-actions router; Task 9's
  `server.ts` calls `createApp`.

These four routers are the mock server's already-correct read side, adapted only to
read `config.workspaceRoot` instead of `config.scratchDir` (the mock server's
scratch/fixture-reset concept doesn't apply here). `app.ts` in this task wires up
these four only; Task 8 adds the fifth (stage actions).

Route tests use a small local `seedTestWorkspace` helper instead of the mock server's
`seedWorkspace`, since this package has no fixture-copy concept — it builds a minimal
git-backed workspace directly, the same way `git.test.ts` and `pipeline.test.ts`
already do inline.

- [ ] **Step 1: Write the test seed helper**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// A minimal git-backed workspace for route-level tests: two approved stages with
// output, a shared/ file, and no lock. Not the real seedRealWorkspace (Task 5) —
// route tests shouldn't depend on this repo's actual stages/examples content.
export function seedTestWorkspace(workspaceRoot: string): void {
  mkdirSync(join(workspaceRoot, 'shared'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '01_research', 'output'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '02_analysis', 'output'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'stages', '03_report', 'output'), { recursive: true });
  writeFileSync(join(workspaceRoot, 'shared', 'client-brief.md'), '# Client Brief\n\nMeridian.\n');
  writeFileSync(join(workspaceRoot, 'stages', '01_research', 'output', 'findings.md'), '# Findings\n');
  writeFileSync(join(workspaceRoot, 'stages', '02_analysis', 'output', 'insights.md'), '# Insights\n');

  mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, '.runner', 'state.json'),
    JSON.stringify(
      {
        stages: {
          '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
          '02_analysis': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        },
      },
      null,
      2
    )
  );

  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: workspaceRoot });
}
```

Save as `platform/web/server/test/helpers/seedTestWorkspace.ts`.

- [ ] **Step 2: Write routes/pipeline.ts and its test**

```ts
import { Router } from 'express';
import { buildPipelineView } from '../pipeline.js';
import type { WorkspaceConfig } from '../workspace.js';

export function createPipelineRouter(config: WorkspaceConfig): Router {
  const router = Router();
  router.get('/api/pipeline', (_req, res) => {
    res.status(200).json(buildPipelineView(config.workspaceRoot));
  });
  return router;
}
```

Save as `platform/web/server/src/routes/pipeline.ts`.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createPipelineRouter } from '../../src/routes/pipeline.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET /api/pipeline', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-pipeline-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('returns 200 with the seeded pipeline: two approved stages and one pending', async () => {
    const app = express();
    app.use(createPipelineRouter(config));
    const res = await request(app).get('/api/pipeline');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.stages.map((s: { name: string }) => s.name)).toEqual([
      '01_research',
      '02_analysis',
      '03_report',
    ]);
    expect(res.body.stages[0].status).toBe('approved');
    expect(res.body.stages[2].status).toBe('pending');
  });
});
```

Save as `platform/web/server/test/routes/pipeline.test.ts`.

- [ ] **Step 3: Write routes/runs.ts and its test**

```ts
import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { readRunLog } from '../state.js';

// Run IDs are always server-generated via randomUUID(). Rejecting anything else
// before it reaches readRunLog's join() closes a directory-traversal read (e.g.
// runId=..%2Fstate resolves to .runner/state.json instead of a run log).
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRunsRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.param('runId', (req, res, next, runId) => {
    if (!RUN_ID_PATTERN.test(runId)) {
      res.status(400).json({ error: 'Invalid runId' });
      return;
    }
    next();
  });

  router.get('/api/runs/:runId', (req, res) => {
    const log = readRunLog(config.workspaceRoot, req.params.runId);
    if (!log) {
      res.status(404).json({ error: 'Unknown run' });
      return;
    }
    res.status(200).json(log);
  });

  return router;
}
```

Save as `platform/web/server/src/routes/runs.ts`.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createRunsRouter } from '../../src/routes/runs.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import { writeRunLog } from '../../src/state.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET /api/runs/:runId', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-runs-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  const KNOWN_RUN_ID = '11111111-1111-1111-1111-111111111111';
  const UNKNOWN_RUN_ID = '22222222-2222-2222-2222-222222222222';

  it('returns the full run log for a known runId', async () => {
    writeRunLog(config.workspaceRoot, {
      runId: KNOWN_RUN_ID,
      stage: '01_research',
      model: 'anthropic/claude-sonnet-5',
      startedAt: '2026-07-12T09:00:00.000Z',
      endedAt: '2026-07-12T09:00:03.000Z',
      status: 'completed',
      filesRead: [],
      filesWritten: ['stages/01_research/output/findings.md'],
      toolCalls: [],
      tokensSpent: 600,
      tokenBudget: 200000,
      gateSummary: 'Done.',
    });
    const app = express();
    app.use(createRunsRouter(config));
    const res = await request(app).get(`/api/runs/${KNOWN_RUN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.runId).toBe(KNOWN_RUN_ID);
    expect(res.body.tokensSpent).toBe(600);
  });

  it('returns 404 for an unknown (but validly-formatted) runId', async () => {
    const app = express();
    app.use(createRunsRouter(config));
    const res = await request(app).get(`/api/runs/${UNKNOWN_RUN_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for a runId that is not a UUID', async () => {
    const app = express();
    app.use(createRunsRouter(config));
    const res = await request(app).get('/api/runs/does-not-exist');
    expect(res.status).toBe(400);
  });

  it('rejects a path-traversal runId that would otherwise escape .runner/runs/', async () => {
    const app = express();
    app.use(createRunsRouter(config));
    const res = await request(app).get('/api/runs/..%2Fstate');
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('stages');
  });
});
```

Save as `platform/web/server/test/routes/runs.test.ts`.

- [ ] **Step 4: Write routes/files.ts and its test**

```ts
import { Router } from 'express';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import type { WorkspaceConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';

class PathEscapesWorkspaceError extends Error {}

function resolveWorkspacePath(workspaceRoot: string, relativePath: string): { absolute: string; relative: string } {
  const root = realpathSync(workspaceRoot);

  if (isAbsolute(relativePath)) {
    throw new PathEscapesWorkspaceError(relativePath);
  }

  const candidate = resolve(root, relativePath);
  assertInsideRoot(root, candidate, relativePath);

  const realCandidate = nearestRealPath(candidate);
  assertInsideRoot(root, realCandidate, relativePath);

  return { absolute: candidate, relative: relative(root, candidate) };
}

function assertInsideRoot(root: string, candidate: string, originalPath: string): void {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PathEscapesWorkspaceError(originalPath);
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

function isRunnerPath(workspaceRelativePath: string): boolean {
  const firstSegment = workspaceRelativePath.split(sep)[0];
  return firstSegment === '.runner' || workspaceRelativePath === '.runner.lock';
}

export function createFilesRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    let resolved: { absolute: string; relative: string };
    try {
      resolved = resolveWorkspacePath(config.workspaceRoot, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (!existsSync(resolved.absolute) || statSync(resolved.absolute).isDirectory()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ path, content: readFileSync(resolved.absolute, 'utf-8') });
  });

  router.put('/api/files', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : undefined;
    if (content === undefined) {
      res.status(422).json({ error: 'content is required' });
      return;
    }

    let resolved: { absolute: string; relative: string };
    try {
      resolved = resolveWorkspacePath(config.workspaceRoot, path);
    } catch {
      res.status(403).json({ error: 'Path escapes workspace' });
      return;
    }
    if (isRunnerPath(resolved.relative)) {
      res.status(403).json({ error: '.runner/ is read-only via the API' });
      return;
    }

    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    mkdirSync(dirname(resolved.absolute), { recursive: true });
    writeFileSync(resolved.absolute, content, 'utf-8');
    commitWorkspace(config.workspaceRoot, `human edit: ${path}`);
    res.status(200).json({});
  });

  return router;
}
```

Save as `platform/web/server/src/routes/files.ts`.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { createFilesRouter } from '../../src/routes/files.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET/PUT /api/files', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-files-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET returns the file content', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('shared/client-brief.md');
    expect(res.body.content).toContain('Meridian');
  });

  it('GET returns 404 for a missing file', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: 'shared/does-not-exist.md' });
    expect(res.status).toBe(404);
  });

  it('GET returns 403 for a path that escapes the workspace', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).get('/api/files').query({ path: '../outside.md' });
    expect(res.status).toBe(403);
  });

  it('PUT writes the file and commits a "human edit"', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();

    const res = await request(app)
      .put('/api/files')
      .query({ path: 'shared/client-brief.md' })
      .send({ content: '# Client Brief\n\nUpdated by a human.\n' });

    expect(res.status).toBe(200);
    const content = readFileSync(join(config.workspaceRoot, 'shared', 'client-brief.md'), 'utf-8');
    expect(content).toContain('Updated by a human.');
    const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: config.workspaceRoot }).toString().trim();
    expect(after).not.toBe(before);
    const log = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: config.workspaceRoot }).toString();
    expect(log).toContain('human edit');
  });

  it('PUT returns 403 for a path targeting .runner/', async () => {
    const app = express();
    app.use(express.json());
    app.use(createFilesRouter(config));
    const res = await request(app).put('/api/files').query({ path: '.runner/state.json' }).send({ content: '{}' });
    expect(res.status).toBe(403);
  });
});
```

Save as `platform/web/server/test/routes/files.test.ts`.

- [ ] **Step 5: Write routes/treeDiffLog.ts and its test**

```ts
import { Router } from 'express';
import type { WorkspaceConfig } from '../workspace.js';
import { getTree, getDiff, getLog, InvalidRefError } from '../git.js';

export function createTreeDiffLogRouter(config: WorkspaceConfig): Router {
  const router = Router();

  router.get('/api/tree', (_req, res) => {
    res.status(200).json(getTree(config.workspaceRoot));
  });

  router.get('/api/diff', (req, res) => {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const ref = typeof req.query.ref === 'string' ? req.query.ref : 'HEAD~1';

    if (path.length === 0) {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    if (ref.startsWith('-')) {
      res.status(400).json({ error: 'invalid ref' });
      return;
    }

    try {
      res.status(200).json(getDiff(config.workspaceRoot, path, ref));
    } catch (err) {
      if (err instanceof InvalidRefError) {
        res.status(400).json({ error: 'invalid ref' });
        return;
      }
      throw err;
    }
  });

  router.get('/api/log', (req, res) => {
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    res.status(200).json(getLog(config.workspaceRoot, limit));
  });

  return router;
}
```

Save as `platform/web/server/src/routes/treeDiffLog.ts`.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTreeDiffLogRouter } from '../../src/routes/treeDiffLog.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import type { WorkspaceConfig } from '../../src/workspace.js';

describe('GET /api/tree, /api/diff, /api/log', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-tree-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('GET /api/tree lists workspace entries including .runner', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    const paths = res.body.map((e: { path: string }) => e.path);
    expect(paths).toContain('shared/client-brief.md');
    expect(paths).toContain('.runner/state.json');
  });

  it('GET /api/diff defaults to ref=HEAD~1 and returns an empty diff for a fresh seed', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md' });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('HEAD~1');
    expect(res.body.diff).toBe('');
  });

  it('GET /api/diff returns 400 for a ref that looks like a git option', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/diff').query({ path: 'shared/client-brief.md', ref: '--output=/tmp/x' });
    expect(res.status).toBe(400);
  });

  it('GET /api/log returns the seed commit', async () => {
    const app = express();
    app.use(createTreeDiffLogRouter(config));
    const res = await request(app).get('/api/log');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].message).toBe('seed');
  });
});
```

Save as `platform/web/server/test/routes/treeDiffLog.test.ts`.

- [ ] **Step 6: Write app.ts (without stage actions yet — Task 8 adds them)**

```ts
import express, { type Express } from 'express';
import cors from 'cors';
import type { WorkspaceConfig } from './workspace.js';
import { createPipelineRouter } from './routes/pipeline.js';
import { createRunsRouter } from './routes/runs.js';
import { createFilesRouter } from './routes/files.js';
import { createTreeDiffLogRouter } from './routes/treeDiffLog.js';

export function createApp(config: WorkspaceConfig): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createPipelineRouter(config));
  app.use(createRunsRouter(config));
  app.use(createFilesRouter(config));
  app.use(createTreeDiffLogRouter(config));
  return app;
}
```

Save as `platform/web/server/src/app.ts`. (Task 8 will add a fifth
`app.use(createStageActionsRouter(config, options))` line and an `options` parameter.)

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `cd platform/web/server && npm run typecheck && npm test`
Expected: both exit 0. Test count so far: 1 (version) + state's + git's + pipeline's +
workspace's (Task 5) + 4 route suites from this task, all passing.

- [ ] **Step 8: Commit**

```bash
git add platform/web/server/src/routes platform/web/server/src/app.ts \
  platform/web/server/test/routes platform/web/server/test/helpers
git commit -m "web-server: add read-only routes (pipeline/runs/files/tree/diff/log) and app.ts"
```

---

### Task 7: Runner CLI adapter (`runnerCli.ts`)

**Files:**
- Create: `platform/web/server/src/runnerCli.ts`
- Test: `platform/web/server/test/runnerCli.test.ts`

**Interfaces:**
- Consumes: `platform/runner`'s `npm run runner -- <command> <stage> --workspace <dir>`
  CLI surface (unchanged — this task only invokes it as a subprocess, never imports
  its TypeScript).
- Produces: the `RunnerCli` interface (`runStageInBackground`, `approveStage`,
  `rejectStage`), `createRunnerCli(runnerDir?: string): RunnerCli`,
  `defaultRunnerCli: RunnerCli`, and `loadOpenRouterApiKey(envPath?: string): string
  | undefined` — Task 8's `routes/stageActions.ts` accepts a `RunnerCli` as an
  injectable dependency (defaulting to `defaultRunnerCli`) so its own tests don't have
  to spawn real processes.

`approveStage`/`rejectStage` are tested here against the **real** runner CLI (fast, no
model call, no network) — this is the one place in the plan that proves the subprocess
integration actually works end to end for those two commands.
`runStageInBackground` (which needs `OPENROUTER_API_KEY` and makes a real model call)
is exercised manually in Task 10, not in the automated suite.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunnerCli, loadOpenRouterApiKey } from '../src/runnerCli.js';
import { readState } from '../src/state.js';

// test/runnerCli.test.ts -> platform/runner is a sibling of web/ (same depth as
// src/runnerCli.ts's own RUNNER_DIR, since test/ and src/ sit at the same level).
const RUNNER_DIR = fileURLToPath(new URL('../../../runner', import.meta.url));

function initGitWorkspace(workspaceRoot: string): void {
  mkdirSync(workspaceRoot, { recursive: true });
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  writeFileSync(join(workspaceRoot, 'README.md'), 'seed');
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: workspaceRoot });
}

describe('runnerCli against the real runner CLI', () => {
  let workspaceRoot: string;
  const runnerCli = createRunnerCli(RUNNER_DIR);

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'runner-cli-'));
    initGitWorkspace(workspaceRoot);
  }, 20000);

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('approveStage shells out to `runner approve` and updates state.json', async () => {
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.runner', 'state.json'),
      JSON.stringify({ stages: { '01_research': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' } } })
    );

    await runnerCli.approveStage(workspaceRoot, '01_research');

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('approved');
  }, 20000);

  it('rejectStage shells out to `runner reject` with the comment and updates state.json', async () => {
    mkdirSync(join(workspaceRoot, '.runner'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, '.runner', 'state.json'),
      JSON.stringify({ stages: { '01_research': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' } } })
    );

    await runnerCli.rejectStage(workspaceRoot, '01_research', 'needs more depth');

    const state = readState(workspaceRoot);
    expect(state.stages['01_research'].status).toBe('rejected');
    expect(state.stages['01_research'].comment).toBe('needs more depth');
  }, 20000);

  it('approveStage rejects its promise when the CLI exits non-zero', async () => {
    // No stages/ dir and an invalid stage name the CLI itself will refuse silently
    // isn't guaranteed to fail, so force a real failure: point at a workspace with
    // no .git at all, which `runner approve`'s commitWorkspace step cannot handle.
    const noGitDir = mkdtempSync(join(tmpdir(), 'runner-cli-nogit-'));
    await expect(runnerCli.approveStage(noGitDir, '01_research')).rejects.toThrow();
    rmSync(noGitDir, { recursive: true, force: true });
  }, 20000);
});

describe('loadOpenRouterApiKey', () => {
  let envDir: string;

  beforeEach(() => {
    envDir = mkdtempSync(join(tmpdir(), 'runner-env-'));
  });

  afterEach(() => {
    rmSync(envDir, { recursive: true, force: true });
  });

  it('returns undefined when the .env file does not exist', () => {
    expect(loadOpenRouterApiKey(join(envDir, 'missing.env'))).toBeUndefined();
  });

  it('parses OPENROUTER_API_KEY out of a .env file', () => {
    const envPath = join(envDir, '.env');
    writeFileSync(envPath, 'SOME_OTHER_VAR=x\nOPENROUTER_API_KEY=sk-or-test-value\n');
    expect(loadOpenRouterApiKey(envPath)).toBe('sk-or-test-value');
  });

  it('returns undefined when the file exists but has no OPENROUTER_API_KEY line', () => {
    const envPath = join(envDir, '.env');
    writeFileSync(envPath, 'SOME_OTHER_VAR=x\n');
    expect(loadOpenRouterApiKey(envPath)).toBeUndefined();
  });
});
```

Save as `platform/web/server/test/runnerCli.test.ts`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd platform/web/server && npm test -- runnerCli.test.ts`
Expected: FAIL — `Cannot find module '../src/runnerCli.js'`.

- [ ] **Step 3: Write runnerCli.ts**

```ts
import { spawn, execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export interface RunnerCli {
  runStageInBackground(workspaceRoot: string, stage: string): void;
  approveStage(workspaceRoot: string, stage: string): Promise<void>;
  rejectStage(workspaceRoot: string, stage: string, comment: string): Promise<void>;
}

// platform/web/server/src/runnerCli.ts -> platform/runner is a sibling of web/.
const RUNNER_DIR = fileURLToPath(new URL('../../../runner', import.meta.url));
const API_KEY_PREFIX = 'OPENROUTER_API_KEY=';

export function loadOpenRouterApiKey(envPath: string = join(RUNNER_DIR, '.env')): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(API_KEY_PREFIX));
  if (!line) return undefined;
  return line.slice(API_KEY_PREFIX.length).trim();
}

function runnerEnv(): NodeJS.ProcessEnv {
  const apiKey = loadOpenRouterApiKey();
  return apiKey ? { ...process.env, OPENROUTER_API_KEY: apiKey } : { ...process.env };
}

export function createRunnerCli(runnerDir: string = RUNNER_DIR): RunnerCli {
  return {
    runStageInBackground(workspaceRoot, stage) {
      const child = spawn(
        'npm',
        ['--prefix', runnerDir, 'run', 'runner', '--', 'run', stage, '--workspace', workspaceRoot],
        { env: runnerEnv() }
      );
      child.stdout?.on('data', (chunk) => process.stdout.write(`[runner ${stage}] ${chunk}`));
      child.stderr?.on('data', (chunk) => process.stderr.write(`[runner ${stage}] ${chunk}`));
      child.on('error', (err) => console.error(`[runner ${stage}] failed to start: ${err.message}`));
    },

    approveStage(workspaceRoot, stage) {
      return new Promise((resolve, reject) => {
        execFile(
          'npm',
          ['--prefix', runnerDir, 'run', 'runner', '--', 'approve', stage, '--workspace', workspaceRoot],
          { env: runnerEnv() },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(stderr?.trim() || err.message));
              return;
            }
            resolve();
          }
        );
      });
    },

    rejectStage(workspaceRoot, stage, comment) {
      return new Promise((resolve, reject) => {
        execFile(
          'npm',
          [
            '--prefix',
            runnerDir,
            'run',
            'runner',
            '--',
            'reject',
            stage,
            '--comment',
            comment,
            '--workspace',
            workspaceRoot,
          ],
          { env: runnerEnv() },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(stderr?.trim() || err.message));
              return;
            }
            resolve();
          }
        );
      });
    },
  };
}

export const defaultRunnerCli: RunnerCli = createRunnerCli();
```

Save as `platform/web/server/src/runnerCli.ts`.

- [ ] **Step 4: Run the tests**

Run: `cd platform/web/server && npm test -- runnerCli.test.ts`
Expected: all tests pass. (The `approveStage`/`rejectStage` tests really invoke
`platform/runner`'s CLI via `tsx` — allow a few seconds for `tsx` startup.)

- [ ] **Step 5: Typecheck**

Run: `cd platform/web/server && npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add platform/web/server/src/runnerCli.ts platform/web/server/test/runnerCli.test.ts
git commit -m "web-server: add runnerCli.ts (shells out to platform/runner's CLI)"
```

---

### Task 8: Stage-action routes (real run/approve/reject)

**Files:**
- Create: `platform/web/server/src/routes/stageActions.ts`
- Modify: `platform/web/server/src/app.ts`
- Test: `platform/web/server/test/routes/stageActions.test.ts`

**Interfaces:**
- Consumes: `STAGE_NAME_PATTERN`, `checkStageOrder` (Task 5); `readState`, `readLock`,
  `writeState`, `writeLock` (Task 2); `RunnerCli`, `defaultRunnerCli` (Task 7).
- Produces: `createStageActionsRouter(config: WorkspaceConfig, options?: {
  runnerCli?: RunnerCli }): Router` — `app.ts` mounts it; `server.ts` (Task 9) doesn't
  pass `options`, so it gets the real `defaultRunnerCli`.

Per the Global Constraints, `runner approve`/`reject` don't self-guard status, so this
router pre-checks `status === 'awaiting_review'` (409 otherwise) before invoking them.
It also pre-checks the lock (409) and stage ordering (422) before spawning `run`,
since the runner CLI's own checks happen asynchronously in the background — after this
route has already returned `202` — and the contract requires those two failure modes
to be synchronous.

Tests inject a fake `RunnerCli` so no subprocess is ever spawned here — Task 7 already
proved the real subprocess integration works; this task tests routing and status-code
logic.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createStageActionsRouter } from '../../src/routes/stageActions.js';
import { seedTestWorkspace } from '../helpers/seedTestWorkspace.js';
import { writeState, writeLock } from '../../src/state.js';
import type { WorkspaceConfig } from '../../src/workspace.js';
import type { RunnerCli } from '../../src/runnerCli.js';

function fakeRunnerCli(): RunnerCli {
  return {
    runStageInBackground: vi.fn(),
    approveStage: vi.fn().mockResolvedValue(undefined),
    rejectStage: vi.fn().mockResolvedValue(undefined),
  };
}

function buildApp(config: WorkspaceConfig, runnerCli: RunnerCli) {
  const app = express();
  app.use(express.json());
  app.use(createStageActionsRouter(config, { runnerCli }));
  return app;
}

describe('stage action routes', () => {
  let config: WorkspaceConfig;

  beforeEach(() => {
    config = { workspaceRoot: join(mkdtempSync(join(tmpdir(), 'route-stage-')), 'workspace') };
    seedTestWorkspace(config.workspaceRoot);
  });

  afterEach(() => {
    rmSync(config.workspaceRoot, { recursive: true, force: true });
  });

  it('POST run returns 202 and delegates to runnerCli.runStageInBackground', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(202);
    expect(runnerCli.runStageInBackground).toHaveBeenCalledWith(config.workspaceRoot, '03_report');
  });

  it('POST run returns 409 with the lock holder when the workspace is already locked', async () => {
    writeLock(config.workspaceRoot, { runId: 'other', stage: '01_research', pid: 1, acquiredAt: '2026-07-12T09:00:00.000Z' });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(409);
    expect(res.body.runId).toBe('other');
    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('POST run returns 422 naming the blocking stage when ordering is violated', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'pending', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(422);
    expect(res.body.blockingStage).toBe('02_analysis');
    expect(res.body.blockingStatus).toBe('pending');
    expect(runnerCli.runStageInBackground).not.toHaveBeenCalled();
  });

  it('POST run returns 422 when the target stage is already awaiting_review', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '03_report': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z', lastRunId: 'seed-run' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/03_report/run');

    expect(res.status).toBe(422);
    expect(res.body.blockingStage).toBe('03_report');
    expect(res.body.blockingStatus).toBe('awaiting_review');
  });

  it('POST approve calls runnerCli.approveStage when awaiting_review, and returns 200', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/02_analysis/approve');

    expect(res.status).toBe(200);
    expect(runnerCli.approveStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis');
  });

  it('POST approve returns 409 without calling the CLI when the stage is not awaiting_review', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/01_research/approve');

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('approved');
    expect(runnerCli.approveStage).not.toHaveBeenCalled();
  });

  it('POST reject requires a non-empty comment and calls runnerCli.rejectStage', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const empty = await request(app).post('/api/stages/02_analysis/reject').send({ comment: '' });
    expect(empty.status).toBe(422);
    expect(runnerCli.rejectStage).not.toHaveBeenCalled();

    const res = await request(app).post('/api/stages/02_analysis/reject').send({ comment: 'too shallow' });
    expect(res.status).toBe(200);
    expect(runnerCli.rejectStage).toHaveBeenCalledWith(config.workspaceRoot, '02_analysis', 'too shallow');
  });

  it('rejects a :stage that does not match the stage-name pattern, for run/approve/reject alike', async () => {
    const runnerCli = fakeRunnerCli();
    const app = buildApp(config, runnerCli);

    const runRes = await request(app).post('/api/stages/..%2F..%2Fetc/run');
    expect(runRes.status).toBe(400);

    const approveRes = await request(app).post('/api/stages/not-a-stage/approve');
    expect(approveRes.status).toBe(400);

    const rejectRes = await request(app).post('/api/stages/not-a-stage/reject').send({ comment: 'x' });
    expect(rejectRes.status).toBe(400);
  });

  it('POST approve returns 500 when the CLI rejects', async () => {
    writeState(config.workspaceRoot, {
      stages: {
        '01_research': { status: 'approved', updatedAt: '2026-07-12T09:00:00.000Z' },
        '02_analysis': { status: 'awaiting_review', updatedAt: '2026-07-12T09:00:00.000Z' },
      },
    });
    const runnerCli: RunnerCli = {
      runStageInBackground: vi.fn(),
      approveStage: vi.fn().mockRejectedValue(new Error('git commit failed')),
      rejectStage: vi.fn(),
    };
    const app = buildApp(config, runnerCli);

    const res = await request(app).post('/api/stages/02_analysis/approve');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('git commit failed');
  });
});
```

Save as `platform/web/server/test/routes/stageActions.test.ts`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd platform/web/server && npm test -- stageActions.test.ts`
Expected: FAIL — `Cannot find module '../../src/routes/stageActions.js'`.

- [ ] **Step 3: Write routes/stageActions.ts**

```ts
import { Router } from 'express';
import { STAGE_NAME_PATTERN, checkStageOrder, type WorkspaceConfig } from '../workspace.js';
import { readState, readLock, type StageStatus } from '../state.js';
import { defaultRunnerCli, type RunnerCli } from '../runnerCli.js';

function getStageStatus(config: WorkspaceConfig, stage: string): StageStatus {
  const state = readState(config.workspaceRoot);
  return state.stages[stage]?.status ?? 'pending';
}

export function createStageActionsRouter(
  config: WorkspaceConfig,
  options: { runnerCli?: RunnerCli } = {}
): Router {
  const router = Router();
  const runnerCli = options.runnerCli ?? defaultRunnerCli;

  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });

  router.post('/api/stages/:stage/run', (req, res) => {
    const { stage } = req.params;

    const lock = readLock(config.workspaceRoot);
    if (lock) {
      res.status(409).json({ runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt });
      return;
    }

    const currentStatus = getStageStatus(config, stage);
    if (currentStatus === 'awaiting_review') {
      res.status(422).json({ blockingStage: stage, blockingStatus: currentStatus });
      return;
    }

    const blocked = checkStageOrder(config.workspaceRoot, stage);
    if (blocked) {
      res.status(422).json({ blockingStage: blocked.blockingStage, blockingStatus: blocked.blockingStatus });
      return;
    }

    runnerCli.runStageInBackground(config.workspaceRoot, stage);
    res.status(202).end();
  });

  router.post('/api/stages/:stage/approve', async (req, res) => {
    const { stage } = req.params;
    const currentStatus = getStageStatus(config, stage);
    if (currentStatus !== 'awaiting_review') {
      res.status(409).json({ stage, status: currentStatus });
      return;
    }
    try {
      await runnerCli.approveStage(config.workspaceRoot, stage);
      res.status(200).json({});
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/api/stages/:stage/reject', async (req, res) => {
    const { stage } = req.params;
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    if (comment.length < 1) {
      res.status(422).json({ error: 'comment is required' });
      return;
    }
    const currentStatus = getStageStatus(config, stage);
    if (currentStatus !== 'awaiting_review') {
      res.status(409).json({ stage, status: currentStatus });
      return;
    }
    try {
      await runnerCli.rejectStage(config.workspaceRoot, stage, comment);
      res.status(200).json({});
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
```

Save as `platform/web/server/src/routes/stageActions.ts`.

- [ ] **Step 4: Wire it into app.ts**

```ts
import express, { type Express } from 'express';
import cors from 'cors';
import type { WorkspaceConfig } from './workspace.js';
import { createPipelineRouter } from './routes/pipeline.js';
import { createRunsRouter } from './routes/runs.js';
import { createFilesRouter } from './routes/files.js';
import { createTreeDiffLogRouter } from './routes/treeDiffLog.js';
import { createStageActionsRouter } from './routes/stageActions.js';
import type { RunnerCli } from './runnerCli.js';

export function createApp(config: WorkspaceConfig, options: { runnerCli?: RunnerCli } = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createPipelineRouter(config));
  app.use(createStageActionsRouter(config, options));
  app.use(createRunsRouter(config));
  app.use(createFilesRouter(config));
  app.use(createTreeDiffLogRouter(config));
  return app;
}
```

Save as `platform/web/server/src/app.ts` (overwrite Task 6's version).

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `cd platform/web/server && npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add platform/web/server/src/routes/stageActions.ts platform/web/server/src/app.ts \
  platform/web/server/test/routes/stageActions.test.ts
git commit -m "web-server: add real run/approve/reject routes wired to runnerCli"
```

---

### Task 9: Server entrypoint

**Files:**
- Create: `platform/web/server/src/server.ts`

**Interfaces:**
- Consumes: `createApp` (Task 8), `seedRealWorkspace` (Task 5).
- Produces: the `platform/web/server` executable entrypoint (`npm run dev`) that
  Task 10's manual verification starts.

- [ ] **Step 1: Write server.ts**

```ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.js';
import { seedRealWorkspace } from './workspace.js';

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4000;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? join(tmpdir(), 'icm-web-live-workspace');

seedRealWorkspace(WORKSPACE_ROOT);

const app = createApp({ workspaceRoot: WORKSPACE_ROOT });

app.listen(PORT, () => {
  console.log(`ICM real web backend listening on http://localhost:${PORT}`);
  console.log(`Live workspace: ${WORKSPACE_ROOT}`);
});
```

Save as `platform/web/server/src/server.ts`.

- [ ] **Step 2: Typecheck**

Run: `cd platform/web/server && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Start it and smoke-test with curl**

Run: `cd platform/web/server && npm run dev &` then, after a couple seconds:
```bash
curl -s http://localhost:4000/api/pipeline | head -c 500
```
Expected: JSON with `"locked":false` and three stages, `01_research`/`02_analysis`
`"status":"approved"`, `03_report` `"status":"pending"`.

Stop it: `kill %1` (or `Ctrl-C` if run in the foreground).

- [ ] **Step 4: Commit**

```bash
git add platform/web/server/src/server.ts
git commit -m "web-server: add server.ts entrypoint"
```

---

### Task 10: Manual end-to-end verification

**Files:** none (no code changes — this task drives the running system).

**Interfaces:** none — this is the plan's acceptance test, exercising every task above
through the real frontend.

- [ ] **Step 1: Start the real backend**

Run in one terminal: `cd platform/web/server && npm run dev`
Expected: logs `ICM real web backend listening on http://localhost:4000` and the live
workspace path. Leave it running.

- [ ] **Step 2: Start the frontend**

Run in a second terminal: `cd platform/web/frontend && npm run dev`
Expected: Vite logs a local URL (typically `http://localhost:5173`).

- [ ] **Step 3: Load the pipeline view in a browser**

Open the Vite URL. Expected: three stage cards — `01_research` and `02_analysis`
showing **approved**, `03_report` showing **pending** with an enabled Run button, no
stage showing running.

- [ ] **Step 4: Trigger a real run of 03_report**

Click Run on `03_report`.

Expected: the stage immediately shows **running** (poll picks up the lock within a
couple of seconds). In the backend terminal, `[runner 03_report]` log lines appear as
the agent reads files and calls the model. This is a real OpenRouter call against the
key in `platform/runner/.env` — allow a couple of minutes.

- [ ] **Step 5: Confirm completion**

Expected: `03_report` transitions to **awaiting_review** (or, if something failed,
back to **pending** with an error surfaced via the last-run summary — either outcome
confirms the wiring works; only a stuck **running** state or a 5xx from the UI would
indicate a real problem). Open the run log (View last run) and confirm it shows a
non-empty `gateSummary` and `tokensSpent > 0`.

- [ ] **Step 6: Inspect the real output**

Use the file viewer to open `stages/03_report/output/report.md` and `audit.md` inside
the running workspace (path logged at server startup). Expected: both files exist and
contain real, model-generated content referencing Meridian Outdoor Gear.

- [ ] **Step 7: Approve the stage through the UI**

Click Approve on `03_report`. Expected: 200 response, stage flips to **approved**, and
`git log` in the live workspace (`cd <live workspace path> && git log --oneline`)
shows the approval commit from `platform/runner`'s `approveCommand`.

- [ ] **Step 8: Record the result**

No commit for this task (nothing changed on disk in the repo). If any step deviated
from "Expected," note it — that's a signal for a follow-up task, not something to
silently patch around during verification.

---

## Self-Review Notes

- **Spec coverage:** every "In scope" bullet from
  `docs/superpowers/specs/2026-07-12-icm-web-real-backend-design.md` maps to a task —
  package scaffold (Task 1), ported read side (Tasks 2-4, 6), real seed (Task 5),
  runner CLI shell-out (Task 7), real stage actions with the approve/reject guard
  (Task 8), and the manual end-to-end pass with cost callout (Task 10).
- **Type consistency:** `WorkspaceConfig { workspaceRoot: string }` (Task 5) is used
  identically by every route file (Task 6, Task 8) and `server.ts` (Task 9).
  `RunnerCli` (Task 7) is the exact shape `routes/stageActions.ts` (Task 8) consumes
  and its tests fake. `StageBlock { blockingStage, blockingStatus }` (Task 5) matches
  the `422` response body shape in both `routes/stageActions.ts` and its tests.
- **No placeholders:** every step either shows complete file content or an exact,
  previously-verified shell command (the `npm --prefix <dir> run runner -- ...`
  invocation pattern in Task 7 was tested directly against `platform/runner` before
  writing this plan).
