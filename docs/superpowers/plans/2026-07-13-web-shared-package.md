# Web Shared Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the DRY violations between `platform/web/mock-server` and `platform/web/server` (and the hand-duplicated API types in `platform/web/frontend`) by extracting the code that is genuinely identical or should be identical into a new `icm-web-shared` workspace package, while leaving code that is *intentionally* different (mock simulation vs. real runner invocation, fixture seeding vs. real seeding) where it is.

**Architecture:** Convert `platform/web/` into an npm workspaces root (`frontend`, `mock-server`, `server`, and a new `shared` package). `shared` holds: the persistence layer (`state.ts`), the pipeline view builder (`pipeline.ts`), the git helpers (`git.ts`), the stage-name pattern/listing (`workspace.ts`), and four Express route factories (`pipeline`, `runs`, `treeDiffLog`, `files`) that are parameterized only by a `{ workspaceRoot: string }` config. `mock-server` and `server` depend on `icm-web-shared` and keep only what's genuinely different: fixture/real workspace seeding, `stageActions.ts`'s run/approve/reject bodies (simulate.ts vs. runnerCli.ts), and their own `server.ts` entrypoints. `frontend` imports its API types from `icm-web-shared` instead of hand-redeclaring them.

**Tech Stack:** TypeScript (NodeNext modules) for `shared`/`mock-server`/`server`, npm workspaces, Vitest, Express, `contracts/openapi.yaml` as the untouched source of truth.

## Global Constraints

- `contracts/` is frozen and read-only — nothing in this plan modifies any file under `contracts/`.
- Do not import code from `platform/runner/` — the shared package lives entirely under `platform/web/`.
- No new runtime dependency changes beyond what's already in `mock-server`'s/`server`'s `package.json` (both currently declare identical `dependencies`: `ajv`, `ajv-formats`, `cors`, `express`).
- Every task that moves existing code must leave existing behavior unchanged unless the task explicitly says otherwise (two tasks intentionally fix a latent behavior divergence — called out inline).
- Node >= 20, `"type": "module"`, NodeNext resolution — matches all three existing `platform/web/*` packages.
- Package manager is npm (each sub-project currently has its own `package-lock.json`; this plan consolidates them into one root lockfile).

---

## File Structure

```
platform/web/
  package.json                 # NEW — npm workspaces root
  package-lock.json             # NEW — single consolidated lockfile
  tsconfig.base.json            # NEW — shared compiler options for shared/mock-server/server
  shared/                       # NEW package: icm-web-shared
    package.json
    tsconfig.json
    src/
      index.ts                  # barrel re-export
      state.ts                  # moved from mock-server & server (byte-identical)
      pipeline.ts                # moved from mock-server & server (byte-identical)
      git.ts                     # moved + reconciled (adopts server's safer implementation)
      workspace.ts               # NEW — STAGE_NAME_PATTERN + listStageNames only
      routes/
        pipeline.ts
        runs.ts
        treeDiffLog.ts
        files.ts
        stageNameGuard.ts
    test/
      git.test.ts                # moved/adapted regression tests for the git.ts merge
  mock-server/
    package.json                 # MODIFY — add icm-web-shared dependency, drop own lockfile
    tsconfig.json                 # MODIFY — extends ../tsconfig.base.json
    src/
      state.ts                    # DELETE (now in shared)
      pipeline.ts                 # DELETE (now in shared)
      git.ts                      # DELETE (now in shared)
      workspace.ts                 # MODIFY — keep only seedWorkspace/WorkspaceConfig/DEFAULT_WORKSPACE_CONFIG; scratchDir renamed to workspaceRoot; STAGE_NAME_PATTERN/listStageNames re-exported from shared
      app.ts                       # MODIFY — import routers from icm-web-shared
      routes/
        pipeline.ts                 # DELETE (now in shared)
        runs.ts                     # DELETE (now in shared)
        treeDiffLog.ts               # DELETE (now in shared)
        files.ts                     # DELETE (now in shared)
        stageActions.ts               # MODIFY — use shared stage-name guard
        reset.ts                       # unchanged (mock-only)
      simulate.ts                      # unchanged (mock-only)
  server/
    package.json                       # MODIFY — add icm-web-shared dependency, drop own lockfile
    tsconfig.json                       # MODIFY — extends ../tsconfig.base.json
    src/
      state.ts                          # DELETE (now in shared)
      pipeline.ts                       # DELETE (now in shared)
      git.ts                            # DELETE (now in shared)
      workspace.ts                       # MODIFY — keep only seedRealWorkspace/WorkspaceConfig/checkStageOrder; STAGE_NAME_PATTERN/listStageNames re-exported from shared
      app.ts                             # MODIFY — import routers from icm-web-shared
      routes/
        pipeline.ts                       # DELETE (now in shared)
        runs.ts                           # DELETE (now in shared)
        treeDiffLog.ts                     # DELETE (now in shared)
        files.ts                           # DELETE (now in shared)
        stageActions.ts                     # MODIFY — use shared stage-name guard
      runnerCli.ts                          # unchanged (server-only)
  frontend/
    package.json                            # MODIFY — add icm-web-shared dependency
    src/api/client.ts                        # MODIFY — re-export types from icm-web-shared instead of redeclaring
```

---

### Task 1: Scaffold npm workspaces root and the `icm-web-shared` package skeleton

**Files:**
- Create: `platform/web/package.json`
- Create: `platform/web/tsconfig.base.json`
- Create: `platform/web/shared/package.json`
- Create: `platform/web/shared/tsconfig.json`
- Create: `platform/web/shared/src/index.ts`
- Modify: `platform/web/mock-server/tsconfig.json`
- Modify: `platform/web/server/tsconfig.json`
- Delete: `platform/web/mock-server/package-lock.json`
- Delete: `platform/web/server/package-lock.json`
- Delete: `platform/web/frontend/package-lock.json`

**Interfaces:**
- Produces: an installable `icm-web-shared` workspace package (currently empty — `index.ts` is a placeholder export removed as later tasks add real exports) that `mock-server`, `server`, and `frontend` can depend on via `"icm-web-shared": "*"`.

- [ ] **Step 1: Create the workspaces root `package.json`**

```json
{
  "name": "icm-web",
  "private": true,
  "workspaces": [
    "frontend",
    "mock-server",
    "server",
    "shared"
  ]
}
```

Path: `platform/web/package.json`

- [ ] **Step 2: Create the shared tsconfig base**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

Path: `platform/web/tsconfig.base.json`

- [ ] **Step 3: Point `mock-server` and `server` tsconfigs at the base**

Replace `platform/web/mock-server/tsconfig.json` with:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Replace `platform/web/server/tsconfig.json` with the same content (both files are currently byte-identical already; this keeps them byte-identical).

- [ ] **Step 4: Create the `icm-web-shared` package manifest**

```json
{
  "name": "icm-web-shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ajv": "^8.17.0",
    "ajv-formats": "^3.0.1",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "typescript": "^5.6.0"
  }
}
```

Path: `platform/web/shared/package.json`

- [ ] **Step 5: Create the `shared` package's tsconfig**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

Path: `platform/web/shared/tsconfig.json`

- [ ] **Step 6: Create a placeholder barrel file**

```typescript
export {};
```

Path: `platform/web/shared/src/index.ts` (later tasks add real exports here)

- [ ] **Step 7: Remove the three per-package lockfiles**

```bash
rm platform/web/frontend/package-lock.json platform/web/mock-server/package-lock.json platform/web/server/package-lock.json
```

- [ ] **Step 8: Install and generate the single root lockfile**

Run: `cd platform/web && npm install`
Expected: completes without error, creates `platform/web/package-lock.json` and `platform/web/node_modules` with `mock-server`, `server`, `frontend`, `shared` symlinked in `node_modules/.bin`/`node_modules/icm-web-shared` etc. No source files changed by this step.

- [ ] **Step 9: Verify existing packages still build/test from their own directories**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS (same as before this task — no source changed yet)

Run: `cd platform/web/server && npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add platform/web/package.json platform/web/package-lock.json platform/web/tsconfig.base.json \
  platform/web/shared platform/web/mock-server/tsconfig.json platform/web/server/tsconfig.json \
  platform/web/mock-server/package-lock.json platform/web/server/package-lock.json platform/web/frontend/package-lock.json
git commit -m "chore(web): set up npm workspaces and icm-web-shared package skeleton"
```

(Note: `git add` on a deleted file stages the deletion; the three old lockfiles are being removed and replaced by the root one.)

---

### Task 2: Move `state.ts` into `icm-web-shared`

**Files:**
- Create: `platform/web/shared/src/state.ts`
- Modify: `platform/web/shared/src/index.ts`
- Delete: `platform/web/mock-server/src/state.ts`
- Delete: `platform/web/server/src/state.ts`
- Modify: every file under `platform/web/mock-server/src/` and `platform/web/mock-server/test/` and `platform/web/server/src/` and `platform/web/server/test/` that imports from `./state.js` or `../state.js` (import path changes to `icm-web-shared`)
- Modify: `platform/web/mock-server/package.json`, `platform/web/server/package.json` — add `"icm-web-shared": "*"` to `dependencies`

**Interfaces:**
- Produces: `icm-web-shared` exports `StageStatus`, `StageState`, `WorkspaceState`, `RunStatus`, `ToolCallLogEntry`, `RunLog`, `LockInfo`, `SchemaValidationError`, `readState`, `writeState`, `updateStageState`, `readLock`, `writeLock`, `clearLock`, `writeRunLog`, `readRunLog` — identical signatures to the current `mock-server/src/state.ts` / `server/src/state.ts` (the two are byte-identical today, confirmed via `diff`).

- [ ] **Step 1: Copy `state.ts` verbatim into the shared package**

`git mv platform/web/mock-server/src/state.ts platform/web/shared/src/state.ts`

The file's content is unchanged (it's byte-identical to `server/src/state.ts`, and the relative path `../../../../contracts/schemas` used by `SCHEMAS_DIR` still resolves correctly — `shared/src/state.ts` is at the same depth from the repo root as `mock-server/src/state.ts` was: `platform/web/shared/src/` → 4 levels up → repo root).

Then delete the now-duplicate copy:

```bash
rm platform/web/server/src/state.ts
```

- [ ] **Step 2: Add `icm-web-shared` as a dependency of both servers**

In `platform/web/mock-server/package.json`, add to `dependencies`:

```json
"icm-web-shared": "*"
```

Do the same in `platform/web/server/package.json`.

Run: `cd platform/web && npm install`
Expected: completes without error, links `icm-web-shared` into both packages' `node_modules`.

- [ ] **Step 3: Re-export from the shared barrel**

Add to `platform/web/shared/src/index.ts`:

```typescript
export * from './state.js';
```

- [ ] **Step 4: Update every import of `state.js` in `mock-server`**

Run to find every call site:

```bash
grep -rl "from '\.\./state\.js'\|from '\./state\.js'" platform/web/mock-server/src platform/web/mock-server/test
```

Expected files (based on current usage): `mock-server/src/pipeline.ts`, `mock-server/src/routes/runs.ts`, `mock-server/src/routes/files.ts`, `mock-server/src/routes/stageActions.ts`, `mock-server/src/routes/treeDiffLog.ts` (indirectly via git.ts — check), `mock-server/test/state.test.ts`, `mock-server/test/pipeline.test.ts`, `mock-server/test/routes/*.test.ts`.

For each, change the import specifier from a relative `state.js` path to `icm-web-shared`, e.g.:

```typescript
// before
import { readRunLog } from '../state.js';
// after
import { readRunLog } from 'icm-web-shared';
```

Apply the same specifier change (keeping the same imported names) to every file the `grep` above lists.

- [ ] **Step 5: Repeat Step 4 for `server`**

```bash
grep -rl "from '\.\./state\.js'\|from '\./state\.js'" platform/web/server/src platform/web/server/test
```

Update every matching file the same way (relative `state.js` import → `icm-web-shared`).

- [ ] **Step 6: Run both test suites to confirm no behavior change**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS (all tests that passed before this task still pass — only import specifiers changed)

Run: `cd platform/web/server && npm test`
Expected: PASS

Run: `cd platform/web/shared && npm run typecheck`
Expected: PASS with no errors

- [ ] **Step 7: Commit**

```bash
git add platform/web/shared/src/state.ts platform/web/shared/src/index.ts \
  platform/web/mock-server platform/web/server
git commit -m "refactor(web): move state.ts into icm-web-shared"
```

---

### Task 3: Move `pipeline.ts` into `icm-web-shared`

**Files:**
- Create: `platform/web/shared/src/pipeline.ts`
- Modify: `platform/web/shared/src/index.ts`
- Delete: `platform/web/server/src/pipeline.ts`
- Modify: `platform/web/mock-server/src/routes/pipeline.ts` (import path only — actual route move happens in Task 7)
- Modify: `platform/web/server/src/routes/pipeline.ts` (import path only)
- Modify: `platform/web/mock-server/test/pipeline.test.ts`, `platform/web/server/test/pipeline.test.ts` (import path only)

**Interfaces:**
- Consumes: `listStageNames` from `./workspace.js` (still local to each project until Task 5), `readState`/`readLock`/`readRunLog` and the `StageStatus`/`RunStatus`/`LockInfo` types from `icm-web-shared` (Task 2).
- Produces: `icm-web-shared` exports `LastRunSummary`, `StageView`, `PipelineView`, `buildPipelineView(workspaceRoot: string): PipelineView`.

- [ ] **Step 1: Move the file, adjusting its internal `state.js` import**

`git mv platform/web/mock-server/src/pipeline.ts platform/web/shared/src/pipeline.ts`

Edit `platform/web/shared/src/pipeline.ts` — change:

```typescript
import { readState, readLock, readRunLog, type StageStatus, type RunStatus, type LockInfo } from './state.js';
```

(this line is unchanged — `./state.js` now correctly resolves to the sibling `shared/src/state.ts` moved in Task 2).

The `listStageNames` import stays as-is for now:

```typescript
import { listStageNames } from './workspace.js';
```

This will resolve once Task 5 creates `shared/src/workspace.ts`. Since Task 3 must be independently testable, temporarily create a minimal `platform/web/shared/src/workspace.ts` containing only:

```typescript
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STAGE_NAME_PATTERN = /^[0-9]{2}_[a-z0-9_]+$/;

export function listStageNames(workspaceRoot: string): string[] {
  const stagesDir = join(workspaceRoot, 'stages');
  if (!existsSync(stagesDir)) return [];
  return readdirSync(stagesDir)
    .filter((name) => STAGE_NAME_PATTERN.test(name) && statSync(join(stagesDir, name)).isDirectory())
    .sort();
}
```

(This is Task 5's deliverable, created early because `pipeline.ts` depends on it. Task 5 will build on this file rather than recreating it — its steps are written to check whether this file already exists.)

Delete the now-duplicate copy:

```bash
rm platform/web/server/src/pipeline.ts
```

- [ ] **Step 2: Re-export from the shared barrel**

Add to `platform/web/shared/src/index.ts`:

```typescript
export * from './pipeline.js';
export * from './workspace.js';
```

- [ ] **Step 3: Update `pipeline.ts` route files and tests in both projects**

In `platform/web/mock-server/src/routes/pipeline.ts`, change:

```typescript
import { buildPipelineView } from '../pipeline.js';
```
to
```typescript
import { buildPipelineView } from 'icm-web-shared';
```

Do the same in `platform/web/server/src/routes/pipeline.ts`.

In `platform/web/mock-server/test/pipeline.test.ts` and `platform/web/server/test/pipeline.test.ts`, change any `from '../src/pipeline.js'` (or similar relative import) to `from 'icm-web-shared'`.

- [ ] **Step 4: Run tests**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS

Run: `cd platform/web/server && npm test`
Expected: PASS

Run: `cd platform/web/shared && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/web/shared/src/pipeline.ts platform/web/shared/src/workspace.ts platform/web/shared/src/index.ts \
  platform/web/mock-server platform/web/server
git commit -m "refactor(web): move pipeline.ts into icm-web-shared"
```

---

### Task 4: Move `git.ts` into `icm-web-shared`, adopting the safer implementation

**Context:** `mock-server/src/git.ts` and `server/src/git.ts` are duplicated with two real behavior differences that are bugs in the mock-server copy, not intentional divergence:
1. `server`'s `walk()` uses `lstatSync` (doesn't follow symlinks — avoids escaping the workspace root or infinite-looping on a circular symlink); `mock-server`'s uses `statSync` (follows symlinks).
2. `server`'s `getLog()` wraps the `git log` call in try/catch to return `[]` on a repo with no commits yet; `mock-server`'s does not — it throws.

This task adopts `server`'s implementation as canonical, which fixes both gaps in `mock-server`.

**Files:**
- Create: `platform/web/shared/src/git.ts`
- Create: `platform/web/shared/test/git.test.ts`
- Delete: `platform/web/server/src/git.ts`
- Modify: `platform/web/shared/src/index.ts`
- Modify: import specifiers in `mock-server`/`server` route files and tests that import `../git.js` or `./git.js`

**Interfaces:**
- Produces: `icm-web-shared` exports `TreeEntry`, `LogEntry`, `DiffResult`, `InvalidRefError`, `commitWorkspace(workspaceRoot: string, message: string): string`, `currentHead(workspaceRoot: string): string`, `getTree(workspaceRoot: string): TreeEntry[]`, `getDiff(workspaceRoot: string, path: string, ref: string): DiffResult`, `getLog(workspaceRoot: string, limit: number): LogEntry[]`.

- [ ] **Step 1: Write a failing test reproducing the mock-server bug (empty-repo `getLog`)**

Path: `platform/web/shared/test/git.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getLog, getTree, getDiff } from '../src/git.js';

describe('git.ts', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'shared-git-test-'));
    execFileSync('git', ['init'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workspaceRoot });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('getLog returns an empty array for a repo with no commits yet, instead of throwing', () => {
    expect(getLog(workspaceRoot, 50)).toEqual([]);
  });

  it('getTree does not follow a symlink that points outside the workspace', () => {
    const { symlinkSync, writeFileSync, mkdirSync } = require('node:fs') as typeof import('node:fs');
    const outside = mkdtempSync(join(tmpdir(), 'shared-git-outside-'));
    writeFileSync(join(outside, 'secret.txt'), 'top secret');
    symlinkSync(outside, join(workspaceRoot, 'escape-link'));

    const entries = getTree(workspaceRoot);
    const link = entries.find((e) => e.path === 'escape-link');
    expect(link?.type).toBe('file');
    expect(entries.some((e) => e.path.startsWith('escape-link/'))).toBe(false);

    rmSync(outside, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd platform/web/shared && npx vitest run test/git.test.ts`
Expected: FAIL — `Cannot find module '../src/git.js'` (the file doesn't exist yet)

- [ ] **Step 3: Move `server/src/git.ts` (the safer implementation) into shared**

`git mv platform/web/server/src/git.ts platform/web/shared/src/git.ts`

No content changes needed — this file is moved as-is (no `import.meta.url` or other repo-relative paths to fix).

Delete the outdated mock-server copy:

```bash
rm platform/web/mock-server/src/git.ts
```

- [ ] **Step 4: Re-export from the shared barrel**

Add to `platform/web/shared/src/index.ts`:

```typescript
export * from './git.js';
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `cd platform/web/shared && npx vitest run test/git.test.ts`
Expected: PASS

- [ ] **Step 6: Update import specifiers in both projects**

```bash
grep -rl "from '\.\./git\.js'\|from '\./git\.js'" platform/web/mock-server/src platform/web/mock-server/test platform/web/server/src platform/web/server/test
```

For each file found (expected: `mock-server/src/routes/files.ts`, `mock-server/src/routes/treeDiffLog.ts`, `mock-server/src/routes/stageActions.ts`, `server/src/routes/files.ts`, `server/src/routes/treeDiffLog.ts`, `server/src/routes/stageActions.ts`, and any `test/git.test.ts` still present in either project — see Step 8), change the import specifier to `icm-web-shared`, keeping the same imported names, e.g.:

```typescript
// before
import { commitWorkspace } from '../git.js';
// after
import { commitWorkspace } from 'icm-web-shared';
```

- [ ] **Step 7: Delete the now-redundant per-project `git.test.ts` files**

`mock-server/test/git.test.ts` and `server/test/git.test.ts` test the same functions now covered by `platform/web/shared/test/git.test.ts` plus each project's own existing coverage of `commitWorkspace`/`currentHead` via their route tests. Before deleting, diff them against the new shared test to confirm no unique assertions are lost:

```bash
diff platform/web/mock-server/test/git.test.ts platform/web/server/test/git.test.ts
```

Port any assertions present in one but not the other (and not already in `shared/test/git.test.ts`) into `platform/web/shared/test/git.test.ts` before deleting both originals:

```bash
rm platform/web/mock-server/test/git.test.ts platform/web/server/test/git.test.ts
```

- [ ] **Step 8: Run all three test suites**

Run: `cd platform/web/shared && npx vitest run`
Expected: PASS

Run: `cd platform/web/mock-server && npm test`
Expected: PASS — including any route test that exercises `/api/log` on a fresh/empty repo now succeeding where it previously would have 500'd

Run: `cd platform/web/server && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add platform/web/shared platform/web/mock-server platform/web/server
git commit -m "refactor(web): move git.ts into icm-web-shared, fixing mock-server's empty-repo log and symlink-follow gaps"
```

---

### Task 5: Finish extracting `STAGE_NAME_PATTERN`/`listStageNames`, trim per-project `workspace.ts` files

**Context:** Task 3 already created `platform/web/shared/src/workspace.ts` with `STAGE_NAME_PATTERN` and `listStageNames` (needed early as a `pipeline.ts` dependency). This task removes the now-duplicated copies from `mock-server`/`server`'s own `workspace.ts` files and re-points their imports, while leaving each project's `seedWorkspace`/`seedRealWorkspace`/`checkStageOrder`/`WorkspaceConfig` — which are genuinely different per project — in place locally.

**Files:**
- Modify: `platform/web/mock-server/src/workspace.ts`
- Modify: `platform/web/server/src/workspace.ts`
- Modify: `platform/web/mock-server/test/workspace.test.ts`, `platform/web/server/test/workspace.test.ts` (only if they test `STAGE_NAME_PATTERN`/`listStageNames` directly — repoint those imports to `icm-web-shared`)

**Interfaces:**
- Consumes: `STAGE_NAME_PATTERN`, `listStageNames` from `icm-web-shared` (already created in Task 3).
- Produces: `mock-server`'s `WorkspaceConfig` keeps `{ fixtureDir, scratchDir, pendingStage }` (renamed in Task 6), `server`'s keeps `{ workspaceRoot }`; each keeps its own `seedWorkspace`/`seedRealWorkspace`.

- [ ] **Step 1: Rewrite `mock-server/src/workspace.ts`**

Replace the full file content with:

```typescript
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listStageNames } from 'icm-web-shared';

export { STAGE_NAME_PATTERN, listStageNames } from 'icm-web-shared';

export interface WorkspaceConfig {
  fixtureDir: string;
  scratchDir: string;
  pendingStage: string;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  fixtureDir: fileURLToPath(new URL('../../../../examples/meridian-support-automation', import.meta.url)),
  scratchDir: join(tmpdir(), 'icm-web-mock-workspace'),
  pendingStage: '03_report',
};

export function seedWorkspace(config: WorkspaceConfig): void {
  const { fixtureDir, scratchDir, pendingStage } = config;

  if (existsSync(scratchDir)) {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  mkdirSync(scratchDir, { recursive: true });
  cpSync(fixtureDir, scratchDir, { recursive: true });

  const pendingOutputDir = join(scratchDir, 'stages', pendingStage, 'output');
  if (existsSync(pendingOutputDir)) {
    rmSync(pendingOutputDir, { recursive: true, force: true });
  }
  mkdirSync(pendingOutputDir, { recursive: true });

  const stageNames = listStageNames(scratchDir);
  const now = new Date().toISOString();
  const stages: Record<string, { status: string; updatedAt: string }> = {};
  for (const name of stageNames) {
    stages[name] = { status: name === pendingStage ? 'pending' : 'approved', updatedAt: now };
  }

  mkdirSync(join(scratchDir, '.runner'), { recursive: true });
  writeFileSync(join(scratchDir, '.runner', 'state.json'), JSON.stringify({ stages }, null, 2));

  execFileSync('git', ['init'], { cwd: scratchDir });
  execFileSync('git', ['config', 'user.email', 'mock-server@icm.local'], { cwd: scratchDir });
  execFileSync('git', ['config', 'user.name', 'ICM Mock Server'], { cwd: scratchDir });
  execFileSync('git', ['add', '-A'], { cwd: scratchDir });
  execFileSync('git', ['commit', '-m', 'Seed workspace from Meridian fixture'], { cwd: scratchDir });
}
```

(Removed: the local `STAGE_NAME_PATTERN` const and `listStageNames` function — both re-exported from `icm-web-shared` instead. `readdirSync`/`statSync` imports dropped since nothing local uses them anymore.)

- [ ] **Step 2: Rewrite `server/src/workspace.ts`**

Replace the full file content with:

```typescript
import { existsSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listStageNames, readState, type StageStatus } from 'icm-web-shared';

export { STAGE_NAME_PATTERN, listStageNames } from 'icm-web-shared';

export interface WorkspaceConfig {
  workspaceRoot: string;
}

export interface StageBlock {
  blockingStage: string;
  blockingStatus: StageStatus;
}

// platform/web/server/src/workspace.ts -> repo root is four levels up.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples', 'meridian-support-automation');
const WORKSPACE_CLAUDE_MD = readFileSync(
  fileURLToPath(new URL('./assets/workspace-claude.md', import.meta.url)),
  'utf-8'
);

const APPROVED_ON_SEED = ['01_research', '02_analysis'];

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

  cpSync(join(REPO_ROOT, 'stages'), join(workspaceRoot, 'stages'), { recursive: true });
  cpSync(join(REPO_ROOT, 'CONTEXT.md'), join(workspaceRoot, 'CONTEXT.md'));

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

  writeFileSync(join(workspaceRoot, 'CLAUDE.md'), WORKSPACE_CLAUDE_MD);

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

(Removed: local `STAGE_NAME_PATTERN` const, `readdirSync`/`statSync` imports, and the local `listStageNames` function — re-exported from `icm-web-shared` instead.)

- [ ] **Step 3: Repoint any test files that import `STAGE_NAME_PATTERN`/`listStageNames` directly**

```bash
grep -rl "STAGE_NAME_PATTERN\|listStageNames" platform/web/mock-server/test platform/web/server/test
```

For any test importing these from `../src/workspace.js` — leave as-is (Step 1/2 keep them re-exported from `workspace.js`, so no test changes are required unless a test imports directly from `icm-web-shared` for some other reason).

- [ ] **Step 4: Run tests**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS

Run: `cd platform/web/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add platform/web/mock-server/src/workspace.ts platform/web/server/src/workspace.ts
git commit -m "refactor(web): re-export STAGE_NAME_PATTERN/listStageNames from icm-web-shared"
```

---

### Task 6: Rename mock-server's `WorkspaceConfig.scratchDir` to `workspaceRoot`

**Context:** `server`'s `WorkspaceConfig` already uses `workspaceRoot`. Aligning the field name lets Task 7's shared route factories accept both projects' config objects with a single `{ workspaceRoot: string }` parameter type, purely via structural typing (no explicit `extends` needed).

**Files:**
- Modify: `platform/web/mock-server/src/workspace.ts` (field rename)
- Modify: `platform/web/mock-server/src/app.ts`
- Modify: `platform/web/mock-server/src/routes/pipeline.ts`, `runs.ts`, `files.ts`, `treeDiffLog.ts`, `stageActions.ts`, `reset.ts`
- Modify: `platform/web/mock-server/src/simulate.ts`
- Modify: `platform/web/mock-server/src/server.ts`
- Modify: every test under `platform/web/mock-server/test/` that constructs a `WorkspaceConfig` object with `scratchDir`

**Interfaces:**
- Produces: `mock-server`'s `WorkspaceConfig` is now `{ fixtureDir: string; scratchDir: never; workspaceRoot: string; pendingStage: string }` — i.e. `scratchDir` is renamed to `workspaceRoot` everywhere, no field removed or added.

- [ ] **Step 1: Rename the field in `WorkspaceConfig` and `DEFAULT_WORKSPACE_CONFIG`**

In `platform/web/mock-server/src/workspace.ts`, change:

```typescript
export interface WorkspaceConfig {
  fixtureDir: string;
  scratchDir: string;
  pendingStage: string;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  fixtureDir: fileURLToPath(new URL('../../../../examples/meridian-support-automation', import.meta.url)),
  scratchDir: join(tmpdir(), 'icm-web-mock-workspace'),
  pendingStage: '03_report',
};
```

to:

```typescript
export interface WorkspaceConfig {
  fixtureDir: string;
  workspaceRoot: string;
  pendingStage: string;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  fixtureDir: fileURLToPath(new URL('../../../../examples/meridian-support-automation', import.meta.url)),
  workspaceRoot: join(tmpdir(), 'icm-web-mock-workspace'),
  pendingStage: '03_report',
};
```

Also update `seedWorkspace`'s destructuring and every `scratchDir` reference inside its body to `workspaceRoot` (the parameter name, all `execFileSync`/`cpSync`/`mkdirSync`/`rmSync`/`writeFileSync` calls that currently reference `scratchDir`).

- [ ] **Step 2: Update every other call site in `mock-server/src`**

```bash
grep -rln "config\.scratchDir\|\.scratchDir\b" platform/web/mock-server/src
```

For each match (expected: `app.ts` isn't affected directly, but `routes/pipeline.ts`, `routes/runs.ts`, `routes/files.ts` (×4 occurrences), `routes/treeDiffLog.ts` (×3), `routes/stageActions.ts` (×6+), `routes/reset.ts`, `simulate.ts`, `server.ts`), replace `config.scratchDir` → `config.workspaceRoot` (and any bare `scratchDir` destructured local variable name that came from the config → `workspaceRoot`, keeping the rest of each function's logic unchanged).

For `simulate.ts` specifically, check its function signatures for a `workspaceRoot` parameter that's currently fed from `config.scratchDir` at the call site in `stageActions.ts` — that parameter name is likely already `workspaceRoot` (only the config field feeding it is renamed), so only the call site (`config.scratchDir` → `config.workspaceRoot`) needs to change there, not `simulate.ts`'s own internals.

- [ ] **Step 3: Update `server.ts`'s log line**

In `platform/web/mock-server/src/server.ts`, change:

```typescript
console.log(`Scratch workspace: ${DEFAULT_WORKSPACE_CONFIG.scratchDir}`);
```

to:

```typescript
console.log(`Scratch workspace: ${DEFAULT_WORKSPACE_CONFIG.workspaceRoot}`);
```

- [ ] **Step 4: Update every test that constructs a mock `WorkspaceConfig`**

```bash
grep -rln "scratchDir" platform/web/mock-server/test
```

For each file, replace every `scratchDir:` object key and `.scratchDir` property access with `workspaceRoot`. This includes the pattern seen in `mock-server/test/routes/files.test.ts`:

```typescript
// before
const scratchDir = join(mkdtempSync(join(tmpdir(), 'route-files-')), 'workspace');
config = { fixtureDir: FIXTURE_DIR, scratchDir, pendingStage: '03_report' };
```
```typescript
// after
const workspaceRoot = join(mkdtempSync(join(tmpdir(), 'route-files-')), 'workspace');
config = { fixtureDir: FIXTURE_DIR, workspaceRoot, pendingStage: '03_report' };
```

and the matching `afterEach` cleanup (`rmSync(config.scratchDir, ...)` → `rmSync(config.workspaceRoot, ...)`).

- [ ] **Step 5: Run tests**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS (pure rename — no behavior change)

Run: `cd platform/web/mock-server && npm run typecheck`
Expected: PASS with no leftover `scratchDir` references

- [ ] **Step 6: Commit**

```bash
git add platform/web/mock-server
git commit -m "refactor(web): rename mock-server WorkspaceConfig.scratchDir to workspaceRoot"
```

---

### Task 7: Extract shared route factories (`pipeline`, `runs`, `treeDiffLog`, `files`)

**Context:** With Task 6 done, both `WorkspaceConfig` types now structurally satisfy `{ workspaceRoot: string }`, so a single route factory implementation can serve both projects. This task also fixes one more latent divergence: `mock-server`'s `/api/log` handler doesn't validate `limit > 0` (only `Number.isFinite`); `server`'s does. The shared version adopts `server`'s stricter check.

**Files:**
- Create: `platform/web/shared/src/routes/pipeline.ts`
- Create: `platform/web/shared/src/routes/runs.ts`
- Create: `platform/web/shared/src/routes/treeDiffLog.ts`
- Create: `platform/web/shared/src/routes/files.ts`
- Modify: `platform/web/shared/src/index.ts`
- Delete: `platform/web/mock-server/src/routes/pipeline.ts`, `runs.ts`, `treeDiffLog.ts`, `files.ts`
- Delete: `platform/web/server/src/routes/pipeline.ts`, `runs.ts`, `treeDiffLog.ts`, `files.ts`
- Modify: `platform/web/mock-server/src/app.ts`, `platform/web/server/src/app.ts`
- Modify: `platform/web/mock-server/test/routes/pipeline.test.ts`, `runs.test.ts`, `treeDiffLog.test.ts`, `files.test.ts` and their `server/test/routes/` counterparts (import path only, plus new coverage for the limit-validation fix)

**Interfaces:**
- Consumes: `WorkspaceRootConfig` (new, exported from `shared/src/workspace.ts`), `buildPipelineView`, `readRunLog`, `readLock`, `commitWorkspace`, `getTree`, `getDiff`, `getLog`, `InvalidRefError` — all already in `icm-web-shared` from Tasks 2–5.
- Produces: `createPipelineRouter`, `createRunsRouter`, `createTreeDiffLogRouter`, `createFilesRouter` — each `(config: WorkspaceRootConfig) => Router`.

- [ ] **Step 1: Add the `WorkspaceRootConfig` type to shared `workspace.ts`**

In `platform/web/shared/src/workspace.ts` (created in Task 3), add:

```typescript
export interface WorkspaceRootConfig {
  workspaceRoot: string;
}
```

- [ ] **Step 2: Write a failing test for the `/api/log` limit-validation fix**

This test targets `mock-server` specifically, since that's the project with the gap. Add to `platform/web/mock-server/test/routes/treeDiffLog.test.ts`:

```typescript
it('GET /api/log treats a non-positive limit as invalid and falls back to 50', async () => {
  const app = createApp(config);
  const res = await request(app).get('/api/log').query({ limit: '-5' });
  expect(res.status).toBe(200);
  expect(res.body.length).toBeLessThanOrEqual(50);
});
```

(Adjust the surrounding `describe`/imports to match the existing file's structure — `createApp` and `config` are already set up by that file's `beforeEach`.)

- [ ] **Step 3: Run it to verify it currently passes or fails**

Run: `cd platform/web/mock-server && npx vitest run test/routes/treeDiffLog.test.ts`
Expected: passes today only by coincidence if the repo has ≤ 50 commits when `limit=-5` is passed straight to `git log -n -5` (git would treat `-5` as invalid and mock-server's un-validated path would let it through) — note the actual current behavior in your run; either way, this test must pass after Step 6 below, which is what proves the fix.

- [ ] **Step 4: Create the four shared route files**

Path: `platform/web/shared/src/routes/pipeline.ts`

```typescript
import { Router } from 'express';
import { buildPipelineView } from '../pipeline.js';
import type { WorkspaceRootConfig } from '../workspace.js';

export function createPipelineRouter(config: WorkspaceRootConfig): Router {
  const router = Router();
  router.get('/api/pipeline', (_req, res) => {
    res.status(200).json(buildPipelineView(config.workspaceRoot));
  });
  return router;
}
```

Path: `platform/web/shared/src/routes/runs.ts`

```typescript
import { Router } from 'express';
import type { WorkspaceRootConfig } from '../workspace.js';
import { readRunLog } from '../state.js';

// Run IDs are always server-generated via randomUUID(). Rejecting anything else
// before it reaches readRunLog's join() closes a directory-traversal read (e.g.
// runId=..%2Fstate resolves to .runner/state.json instead of a run log).
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createRunsRouter(config: WorkspaceRootConfig): Router {
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

Path: `platform/web/shared/src/routes/treeDiffLog.ts`

```typescript
import { Router } from 'express';
import type { WorkspaceRootConfig } from '../workspace.js';
import { getTree, getDiff, getLog, InvalidRefError } from '../git.js';

export function createTreeDiffLogRouter(config: WorkspaceRootConfig): Router {
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
    // Belt-and-suspenders: getDiff() enforces this too (the real security
    // boundary, since it's what shells out to git), but rejecting here
    // avoids the exception path for the common case of an obviously bad ref.
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
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50;
    res.status(200).json(getLog(config.workspaceRoot, limit));
  });

  return router;
}
```

Path: `platform/web/shared/src/routes/files.ts`

```typescript
import { Router } from 'express';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import type { WorkspaceRootConfig } from '../workspace.js';
import { readLock } from '../state.js';
import { commitWorkspace } from '../git.js';

class PathEscapesWorkspaceError extends Error {}

/**
 * Resolve `relativePath` against `workspaceRoot`, rejecting anything that
 * escapes the workspace either lexically (`..` segments) or via a symlink
 * that points outside the workspace (checked by realpath-ing the nearest
 * existing ancestor, since `candidate` itself may not exist yet — e.g. a
 * new file for PUT). Returns the resolved absolute path plus the
 * workspace-relative path (normalized), which callers should use for any
 * further checks (e.g. `.runner/` protection) instead of the raw query
 * string.
 */
function resolveWorkspacePath(workspaceRoot: string, relativePath: string): { absolute: string; relative: string } {
  // Resolve the root itself in case it's reached via a symlink (e.g.
  // macOS /tmp -> /private/tmp), so later comparisons are apples-to-apples.
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

/**
 * Realpath the nearest existing ancestor of `candidate` and re-append the
 * (necessarily `..`-free) remainder, so a not-yet-existing target path can
 * still be checked for a symlink escape via one of its parent directories.
 */
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

export function createFilesRouter(config: WorkspaceRootConfig): Router {
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

- [ ] **Step 5: Re-export from the shared barrel**

Add to `platform/web/shared/src/index.ts`:

```typescript
export * from './routes/pipeline.js';
export * from './routes/runs.js';
export * from './routes/treeDiffLog.js';
export * from './routes/files.js';
```

- [ ] **Step 6: Delete the four duplicated route files from both projects, update `app.ts`**

```bash
rm platform/web/mock-server/src/routes/pipeline.ts platform/web/mock-server/src/routes/runs.ts \
   platform/web/mock-server/src/routes/treeDiffLog.ts platform/web/mock-server/src/routes/files.ts
rm platform/web/server/src/routes/pipeline.ts platform/web/server/src/routes/runs.ts \
   platform/web/server/src/routes/treeDiffLog.ts platform/web/server/src/routes/files.ts
```

In `platform/web/mock-server/src/app.ts`, change the four corresponding imports:

```typescript
import { createPipelineRouter, createRunsRouter, createFilesRouter, createTreeDiffLogRouter } from 'icm-web-shared';
import { createStageActionsRouter } from './routes/stageActions.js';
import { createResetRouter } from './routes/reset.js';
```

(keep `createStageActionsRouter` and `createResetRouter` as local imports — unchanged). Apply the equivalent change to `platform/web/server/src/app.ts`, keeping `createStageActionsRouter` local there too.

- [ ] **Step 7: Update route test imports in both projects**

```bash
grep -rl "from '\.\./\.\./src/routes/pipeline\.js'\|from '\.\./\.\./src/routes/runs\.js'\|from '\.\./\.\./src/routes/treeDiffLog\.js'\|from '\.\./\.\./src/routes/files\.js'" platform/web/mock-server/test platform/web/server/test
```

These route factories are exercised through `createApp` in existing tests (not imported directly in most cases) — if any test file does import one of the four factories directly, change the import specifier to `icm-web-shared`.

- [ ] **Step 8: Run the limit-validation test and full suites**

Run: `cd platform/web/mock-server && npx vitest run test/routes/treeDiffLog.test.ts`
Expected: PASS (the fix from Step 4's shared `treeDiffLog.ts` now applies)

Run: `cd platform/web/mock-server && npm test`
Expected: PASS

Run: `cd platform/web/server && npm test`
Expected: PASS

Run: `cd platform/web/shared && npm run typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add platform/web/shared platform/web/mock-server platform/web/server
git commit -m "refactor(web): extract shared pipeline/runs/treeDiffLog/files route factories, fix mock-server log limit validation"
```

---

### Task 8: Extract the shared stage-name param guard

**Files:**
- Create: `platform/web/shared/src/routes/stageNameGuard.ts`
- Modify: `platform/web/shared/src/index.ts`
- Modify: `platform/web/mock-server/src/routes/stageActions.ts`
- Modify: `platform/web/server/src/routes/stageActions.ts`

**Interfaces:**
- Produces: `registerStageNameGuard(router: Router): void` — registers the `router.param('stage', ...)` validation that both projects currently duplicate verbatim.

- [ ] **Step 1: Create the shared guard**

```typescript
import type { Router } from 'express';
import { STAGE_NAME_PATTERN } from '../workspace.js';

// Reject any :stage that doesn't match the contract's stage-name pattern before it can
// reach a filesystem operation or a state.json object key.
export function registerStageNameGuard(router: Router): void {
  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });
}
```

Path: `platform/web/shared/src/routes/stageNameGuard.ts`

- [ ] **Step 2: Re-export from the shared barrel**

Add to `platform/web/shared/src/index.ts`:

```typescript
export * from './routes/stageNameGuard.js';
```

- [ ] **Step 3: Use it in `mock-server/src/routes/stageActions.ts`**

Change:

```typescript
import { STAGE_NAME_PATTERN, type WorkspaceConfig } from '../workspace.js';
```
to
```typescript
import type { WorkspaceConfig } from '../workspace.js';
import { registerStageNameGuard } from 'icm-web-shared';
```

Replace:

```typescript
  // Reject any :stage that doesn't match the contract's stage-name pattern before it can
  // reach a filesystem operation (completeStageRun's cpSync) or a state.json object key.
  router.param('stage', (req, res, next, stage) => {
    if (!STAGE_NAME_PATTERN.test(stage)) {
      res.status(400).json({ error: 'Invalid stage name' });
      return;
    }
    next();
  });
```
with
```typescript
  registerStageNameGuard(router);
```

- [ ] **Step 4: Apply the equivalent change to `server/src/routes/stageActions.ts`**

Same import swap and replacement of its `router.param('stage', ...)` block with `registerStageNameGuard(router);`. Leave every other line of both `stageActions.ts` files untouched — the run/approve/reject bodies are intentionally different (mock uses `simulate.ts`, server uses `runnerCli.ts`) and out of scope for this plan.

- [ ] **Step 5: Run tests**

Run: `cd platform/web/mock-server && npm test`
Expected: PASS

Run: `cd platform/web/server && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add platform/web/shared platform/web/mock-server/src/routes/stageActions.ts platform/web/server/src/routes/stageActions.ts
git commit -m "refactor(web): extract shared stage-name param guard"
```

---

### Task 9: Frontend consumes shared types from `icm-web-shared`

**Context:** `frontend/src/api/client.ts` currently hand-redeclares `StageStatus`, `RunStatus`, `LastRunSummary`, `LockView`, `StageView`, `Pipeline`, `ToolCallLogEntry`, `RunLog`, `TreeEntry`, `DiffResult`, `LogEntry` — all of which now have canonical definitions in `icm-web-shared` (from Tasks 2–4). Two of the frontend's local types (`LastRunSummary.gateSummary`/`errorMessage`, `StageView.comment`) are wider (`| null`) than the shared source types (`| undefined` only, no explicit `null`); since Express never serializes an explicit `null` for these optional fields (they're simply omitted when unset), narrowing to the shared type is safe. `frontend`'s own `FileContent` and `ApiError` have no shared equivalent and stay local.

**Files:**
- Modify: `platform/web/frontend/package.json` — add `"icm-web-shared": "*"` to `dependencies`
- Modify: `platform/web/frontend/src/api/client.ts`

**Interfaces:**
- Consumes: `StageStatus`, `RunStatus`, `LastRunSummary`, `LockInfo`, `StageView`, `PipelineView`, `ToolCallLogEntry`, `RunLog`, `TreeEntry`, `DiffResult`, `LogEntry` — all `import type` only, from `icm-web-shared`.
- Produces: `client.ts` re-exports the same names it exported before (`Pipeline`, `LockView`, etc.) so no other frontend file needs to change.

- [ ] **Step 1: Add the dependency**

In `platform/web/frontend/package.json`, add to `dependencies`:

```json
"icm-web-shared": "*"
```

Run: `cd platform/web && npm install`
Expected: completes without error, links `icm-web-shared` into `frontend/node_modules`.

- [ ] **Step 2: Check for any `=== null` comparisons on the fields being narrowed**

```bash
grep -rn "gateSummary\s*===\s*null\|errorMessage\s*===\s*null\|comment\s*===\s*null" platform/web/frontend/src
```

Expected: no matches (these fields are only ever read/displayed conditionally with `?.`/truthiness checks in this codebase, not compared to `null`). If any match is found, note it — it will still compile after Step 3 (comparing a `string | undefined` to `null` is not a TS error, it just always evaluates `false`), but flag it in the task's PR/commit description as a pre-existing minor behavior no-op worth a human's attention rather than silently changing it here.

- [ ] **Step 3: Replace the hand-declared types in `client.ts` with re-exports from shared**

Replace lines 1–57 of `platform/web/frontend/src/api/client.ts` (from `export type StageStatus = ...` through the closing brace of `RunLog`) with:

```typescript
export type {
  StageStatus,
  RunStatus,
  LastRunSummary,
  StageView,
  ToolCallLogEntry,
  RunLog,
  TreeEntry,
  DiffResult,
  LogEntry,
} from 'icm-web-shared';
export type { PipelineView as Pipeline, LockInfo as LockView } from 'icm-web-shared';
```

Leave everything from `export interface FileContent` (originally line 64) onward completely unchanged — `FileContent`, `ApiError`, `request()`, and all the `get*`/`put*`/`run*`/`approve*`/`reject*` functions stay exactly as they are.

- [ ] **Step 4: Typecheck and run the frontend test suite**

Run: `cd platform/web/frontend && npm run typecheck`
Expected: PASS — confirms every component consuming `Pipeline`, `LockView`, `StageView`, etc. from `./api/client.js` still compiles against the re-exported shared types

Run: `cd platform/web/frontend && npm test`
Expected: PASS

- [ ] **Step 5: Manually verify the dev server still serves the app correctly**

Run: `cd platform/web/frontend && npm run build`
Expected: PASS with no type errors (this also exercises the production Vite build, confirming the type-only re-export is fully erased and doesn't pull `state.ts`'s Node/`ajv` runtime code into the browser bundle)

- [ ] **Step 6: Commit**

```bash
git add platform/web/frontend
git commit -m "refactor(web): consume shared API types from icm-web-shared in frontend client"
```

---

### Task 10: Final cross-package verification

**Files:** none (verification only)

- [ ] **Step 1: Run every package's test suite from the workspaces root**

Run: `cd platform/web && npm test --workspace=shared --workspace=mock-server --workspace=server --workspace=frontend`
Expected: all four PASS

(If the installed npm version doesn't support multiple `--workspace` flags in one invocation, run each individually: `npm test -w shared`, `npm test -w mock-server`, `npm test -w server`, `npm test -w frontend`.)

- [ ] **Step 2: Run typecheck across all packages**

Run: `cd platform/web && npm run typecheck -w shared -w mock-server -w server -w frontend`
Expected: all PASS with zero errors

- [ ] **Step 3: Confirm no dangling references to deleted files**

```bash
grep -rn "routes/pipeline\.js\|routes/runs\.js\|routes/treeDiffLog\.js\|routes/files\.js" platform/web/mock-server/src platform/web/server/src --include=*.ts | grep -v "icm-web-shared"
```

Expected: no output (all such imports now go through `icm-web-shared` or were deleted).

```bash
grep -rln "scratchDir" platform/web/mock-server
```

Expected: no output.

- [ ] **Step 4: Start both backends and confirm they boot**

Run: `cd platform/web/mock-server && timeout 5 npm run dev` (or run and manually Ctrl-C after confirming the "ICM mock server listening" log line)
Expected: starts without error, logs the expected listening message

Run: `cd platform/web/server && timeout 5 npm run dev`
Expected: starts without error, logs the expected listening message

- [ ] **Step 5: Commit (if Step 3's greps required any cleanup) or confirm clean tree**

```bash
git status
```

Expected: clean (all changes already committed in Tasks 1–9) — this step is a checkpoint, not expected to produce a new commit unless Step 3 found something to fix.

---

## Out of scope (noted, not addressed by this plan)

- **`vitest.config.ts`** (`mock-server/vitest.config.ts` vs `server/vitest.config.ts`): identical 8-line files. Low enough value (and low enough risk) that extracting a shared base config wasn't worth a task; a human can fold this in by hand in under a minute if desired.
- **Identical `dependencies` blocks in `package.json`**: `mock-server` and `server` both declare `ajv`, `ajv-formats`, `cors`, `express`. This isn't actually a DRY violation in an npm-workspaces setup — each workspace package is expected to declare its own runtime dependencies even when another workspace package happens to need the same ones — so no task changes this.
- **Test-fixture seeding boilerplate** (`mkdtempSync`/`git init` repeated across ~6 test files per project): mock-server seeds from a static fixture directory via `seedWorkspace`, server seeds a synthetic minimal workspace via its own `seedTestWorkspace` helper — the two seeding strategies are different enough (and the duplication is *within* each project, not really *across* them) that folding them into one shared test helper is a separate, smaller follow-up, not bundled into this extraction.
- **`stageActions.ts` run/approve/reject bodies**: intentionally different (mock simulates via `simulate.ts`; server shells out via `runnerCli.ts`) — not a DRY violation, left untouched beyond the Task 8 param-guard extraction.
