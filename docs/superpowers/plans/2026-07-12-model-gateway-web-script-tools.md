# Model Gateway, Web Tool, Script Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three new, independent `platform/runner/` modules — a per-workspace config
loader (`config.ts`), a domain-allowlisted `fetch_url` tool (`webTool.ts`), and a jailed
`run_script` tool (`scriptTool.ts`) — plus a documented (not applied) integration plan and a
draft contract proposal, without touching any file the parallel runtime-core worktree owns.

**Architecture:** Same TypeScript/Node/vitest package shape as the runtime-core plan
(`docs/superpowers/plans/2026-07-12-runtime-storage-core.md`), scaffolded independently in
this worktree since `platform/runner/` does not exist on `main`. Each module is
self-contained: `config.ts` has no dependency on the other two; `webTool.ts` depends only on
global `fetch`; `scriptTool.ts` depends only on `node:child_process`/`node:fs`/`node:path`
plus a mirrored copy of `jail.ts`'s containment check (the real `jail.ts` is owned by the
parallel worktree and doesn't exist here). None of the three import from or export into
`tools.ts`, `agentLoop.ts`, or `commands/` — that wiring is written up in `INTEGRATION.md`
for a human to apply after the runtime-core worktree merges.

**Tech Stack:** TypeScript (Node ≥20, ESM), `tsx`, `vitest`. No new runtime dependencies —
`fetch`/`URL`/`Response`/`execFileSync` are all built in.

## Global Constraints

- Read-only: `contracts/` — never modify; if something doesn't fit, flag it instead (see
  Task 5's "blocking human decision" note).
- Do NOT create or modify: `platform/runner/src/{jail,lock,tokenBudget,runLog,state,git,
  openrouter,tools,agentLoop,cli}.ts`, their tests, or anything in `platform/runner/src/
  commands/`. These belong to the parallel runtime-core worktree.
- `package.json` may only be created fresh here (it doesn't exist on `main`) and mirrored
  exactly from the runtime-core worktree's version — no extra dependencies beyond its four
  devDependencies, since none of the three modules need one.
- Every module gets its own commit, tests-first (TDD), per the worktree-3 prompt
  (`docs/prompts/worktree-3-model-gateway.md`).
- `ToolDef` shape (mirrored, since `openrouter.ts` doesn't exist here):
  `{ type: 'function'; function: { name: string; description: string; parameters:
  Record<string, unknown> } }` — from Task 8 of the runtime-storage-core plan.
- `ToolResult`-shaped return value for both tool functions: `{ ok: boolean; content: string }`
  — from Task 9 of the runtime-storage-core plan.
- Vetted models (mvp-spec §5, exact list): `anthropic/claude-sonnet-5`,
  `anthropic/claude-opus-4.8`, `openai/gpt-5.2`.

---

### Task 1: Project scaffolding

**Files:**
- Create: `platform/runner/package.json`
- Create: `platform/runner/tsconfig.json`
- Create: `platform/runner/vitest.config.ts`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: a working `npm test` and `npm run typecheck` in `platform/runner/` for every
  later task. Mirrors the runtime-core worktree's Task 1 output exactly (same package name,
  scripts, devDependencies) so the two `package.json` files merge cleanly later.

- [ ] **Step 1: Create `package.json`**

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

- [ ] **Step 5: Update repo-root `.gitignore`**

Append these lines (identical to the runtime-core worktree's addition, so the two branches'
edits to this file merge without conflict):

```
platform/runner/node_modules/
platform/runner/dist/
.runner.lock
.runner/
```

- [ ] **Step 6: Commit**

```bash
git add platform/runner/package.json platform/runner/package-lock.json platform/runner/tsconfig.json platform/runner/vitest.config.ts .gitignore
git commit -m "runner: scaffold platform/runner package (worktree 3)"
```

---

### Task 2: Module 1 — `config.ts`

**Files:**
- Create: `platform/runner/src/config.ts`
- Test: `platform/runner/test/config.test.ts`

**Interfaces:**
- Produces: `interface RunnerConfig { model: string; tokenBudget: number; allowedDomains: string[] }`.
- Produces: `const VETTED_MODELS: string[]` — exactly `['anthropic/claude-sonnet-5', 'anthropic/claude-opus-4.8', 'openai/gpt-5.2']`.
- Produces: `class ConfigError extends Error { field: string }`.
- Produces: `loadConfig(workspaceRoot: string): RunnerConfig`.
- Consumed by: `commands/run.ts` post-merge (see `INTEGRATION.md`, Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, ConfigError, VETTED_MODELS } from '../src/config.js';

describe('loadConfig', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'config-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns defaults when runner.config.json is missing', () => {
    const config = loadConfig(workspaceRoot);
    expect(config).toEqual({
      model: 'anthropic/claude-sonnet-5',
      tokenBudget: 200_000,
      allowedDomains: [],
    });
  });

  it('merges a partial file over the defaults', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ tokenBudget: 50_000 }));
    const config = loadConfig(workspaceRoot);
    expect(config.model).toBe('anthropic/claude-sonnet-5');
    expect(config.tokenBudget).toBe(50_000);
    expect(config.allowedDomains).toEqual([]);
  });

  it('accepts a fully specified config', () => {
    writeFileSync(
      join(workspaceRoot, 'runner.config.json'),
      JSON.stringify({ model: 'openai/gpt-5.2', tokenBudget: 10_000, allowedDomains: ['example.com'] })
    );
    const config = loadConfig(workspaceRoot);
    expect(config).toEqual({ model: 'openai/gpt-5.2', tokenBudget: 10_000, allowedDomains: ['example.com'] });
  });

  it('throws ConfigError naming "model" for a non-vetted model', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ model: 'meta/llama-4' }));
    expect(() => loadConfig(workspaceRoot)).toThrow(ConfigError);
    expect(() => loadConfig(workspaceRoot)).toThrow(/model/);
  });

  it('throws ConfigError naming "tokenBudget" for a non-positive budget', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ tokenBudget: -5 }));
    expect(() => loadConfig(workspaceRoot)).toThrow(/tokenBudget/);
  });

  it('throws ConfigError naming "allowedDomains" when not an array of strings', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ allowedDomains: ['ok', 5] }));
    expect(() => loadConfig(workspaceRoot)).toThrow(/allowedDomains/);
  });

  it('throws ConfigError for malformed JSON', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), '{ not json');
    expect(() => loadConfig(workspaceRoot)).toThrow(ConfigError);
  });

  it('exposes exactly the three vetted models', () => {
    expect(VETTED_MODELS).toEqual(['anthropic/claude-sonnet-5', 'anthropic/claude-opus-4.8', 'openai/gpt-5.2']);
  });
});
```

Save as `platform/runner/test/config.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 3: Implement `config.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunnerConfig {
  model: string;
  tokenBudget: number;
  allowedDomains: string[];
}

export const VETTED_MODELS: string[] = [
  'anthropic/claude-sonnet-5',
  'anthropic/claude-opus-4.8',
  'openai/gpt-5.2',
];

const DEFAULTS: RunnerConfig = {
  model: 'anthropic/claude-sonnet-5',
  tokenBudget: 200_000,
  allowedDomains: [],
};

export class ConfigError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Invalid runner.config.json field "${field}": ${message}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(workspaceRoot: string): RunnerConfig {
  const path = join(workspaceRoot, 'runner.config.json');
  if (!existsSync(path)) {
    return { ...DEFAULTS, allowedDomains: [...DEFAULTS.allowedDomains] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new ConfigError('<root>', 'runner.config.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('<root>', 'runner.config.json must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const config: RunnerConfig = { ...DEFAULTS, allowedDomains: [...DEFAULTS.allowedDomains] };

  if ('model' in obj) {
    if (typeof obj.model !== 'string' || !VETTED_MODELS.includes(obj.model)) {
      throw new ConfigError('model', `must be one of: ${VETTED_MODELS.join(', ')}`);
    }
    config.model = obj.model;
  }

  if ('tokenBudget' in obj) {
    if (typeof obj.tokenBudget !== 'number' || !Number.isFinite(obj.tokenBudget) || obj.tokenBudget <= 0) {
      throw new ConfigError('tokenBudget', 'must be a positive finite number');
    }
    config.tokenBudget = obj.tokenBudget;
  }

  if ('allowedDomains' in obj) {
    if (!Array.isArray(obj.allowedDomains) || !obj.allowedDomains.every((d) => typeof d === 'string')) {
      throw new ConfigError('allowedDomains', 'must be an array of strings');
    }
    config.allowedDomains = obj.allowedDomains as string[];
  }

  return config;
}
```

Save as `platform/runner/src/config.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/config.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/config.ts platform/runner/test/config.test.ts
git commit -m "runner: add per-workspace config loader with vetted-model guard"
```

---

### Task 3: Module 2 — `webTool.ts`

**Files:**
- Create: `platform/runner/src/webTool.ts`
- Test: `platform/runner/test/webTool.test.ts`

**Interfaces:**
- Produces: local `interface ToolDef` (mirrors `openrouter.ts`'s, which doesn't exist here —
  collapse into an import after merge, see `INTEGRATION.md`).
- Produces: `const FETCH_URL_DEF: ToolDef`.
- Produces: `fetchUrl(url: string, allowedDomains: string[]): Promise<{ ok: boolean; content: string }>`.
- Consumed by: `tools.ts` post-merge (see `INTEGRATION.md`, Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUrl, FETCH_URL_DEF } from '../src/webTool.js';

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe('FETCH_URL_DEF', () => {
  it('describes the fetch_url tool', () => {
    expect(FETCH_URL_DEF.function.name).toBe('fetch_url');
    expect(FETCH_URL_DEF.function.parameters).toMatchObject({
      type: 'object',
      required: ['url'],
    });
  });
});

describe('fetchUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds for an allowlisted domain and strips HTML tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('<p>hello</p>')));
    const result = await fetchUrl('https://example.com/page', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello');
    expect(result.content).not.toContain('<p>');
  });

  it('allows a subdomain of an allowlisted domain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('docs page')));
    const result = await fetchUrl('https://docs.example.com/page', ['example.com']);
    expect(result.ok).toBe(true);
  });

  it('refuses a domain that merely shares a suffix', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('nope'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://notexample.com/page', ['example.com']);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when the allowlist is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/not allowlisted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-https URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('http://example.com', ['example.com']);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/https/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses IP-literal hosts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://127.0.0.1/', ['127.0.0.1']);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a redirect to another allowlisted host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse('', 302, { location: 'https://docs.example.com/final' }))
      .mockResolvedValueOnce(htmlResponse('final content'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com/start', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('final content');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect to a non-allowlisted host', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(htmlResponse('', 302, { location: 'https://evil.com/steal' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com/start', ['example.com']);
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('truncates content over the 500KB cap with a marker', async () => {
    const big = 'a'.repeat(600 * 1024);
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(big)));
    const result = await fetchUrl('https://example.com/big', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(600 * 1024);
  });
});
```

Save as `platform/runner/test/webTool.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/webTool.test.ts`
Expected: FAIL — `Cannot find module '../src/webTool.js'`.

- [ ] **Step 3: Implement `webTool.ts`**

```typescript
export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const FETCH_URL_DEF: ToolDef = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Fetch a URL from an allowlisted domain (https only) and return its readable text content. Used by research stages to pull reference material.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The https URL to fetch.' } },
      required: ['url'],
    },
  },
};

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 500 * 1024;
const TRUNCATION_MARKER = '\n\n[... truncated at 500KB ...]';

// SSRF guard: reject IP-literal hosts outright. This does NOT protect against
// DNS rebinding (an allowlisted hostname resolving to a private/loopback address
// at fetch time) — that's a known v2 gap, not covered by this check.
function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  const bare = host.replace(/^\[/, '').replace(/\]$/, '');
  return bare.includes(':');
}

function isAllowedHost(host: string, allowedDomains: string[]): boolean {
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function refusalFor(url: URL, allowedDomains: string[]): string | null {
  if (url.protocol !== 'https:') {
    return `Refused: only https URLs are allowed (got "${url.protocol}")`;
  }
  if (isIpLiteral(url.hostname)) {
    return `Refused: IP-literal hosts are not allowed ("${url.hostname}")`;
  }
  if (allowedDomains.length === 0 || !isAllowedHost(url.hostname, allowedDomains)) {
    return `Refused: domain "${url.hostname}" is not allowlisted`;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchUrl(url: string, allowedDomains: string[]): Promise<{ ok: boolean; content: string }> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(url);
  } catch {
    return { ok: false, content: `Refused: invalid URL "${url}"` };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const refusal = refusalFor(currentUrl, allowedDomains);
    if (refusal) return { ok: false, content: refusal };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), { redirect: 'manual', signal: controller.signal });
    } catch (err) {
      return { ok: false, content: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return { ok: false, content: `Redirect response (status ${response.status}) had no Location header` };
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      return { ok: false, content: `Fetch failed with status ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const truncated = buffer.byteLength > MAX_BYTES;
    const bytes = truncated ? buffer.slice(0, MAX_BYTES) : buffer;
    const text = new TextDecoder('utf-8').decode(bytes);
    const content = stripHtml(text);
    return { ok: true, content: truncated ? content + TRUNCATION_MARKER : content };
  }

  return { ok: false, content: `Refused: exceeded ${MAX_REDIRECTS} redirects` };
}
```

Save as `platform/runner/src/webTool.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/webTool.test.ts`
Expected: PASS — 10 tests passed.

- [ ] **Step 5: Commit**

```bash
git add platform/runner/src/webTool.ts platform/runner/test/webTool.test.ts
git commit -m "runner: add fetch_url tool with domain allowlist and SSRF guard"
```

---

### Task 4: Module 3 — `scriptTool.ts`

**Files:**
- Create: `platform/runner/src/scriptTool.ts`
- Create fixtures: `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/hello.py`,
  `.../hello.js`, `.../echo_args.py`, `.../fail.py`, `.../print_env.py`, `.../sleep.py`,
  `.../big_output.py`, `.../unsupported.sh`,
  `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/other/notallowed.py`
- Test: `platform/runner/test/scriptTool.test.ts`

**Interfaces:**
- Produces: local `interface ToolDef` (same shape as Task 3's; duplicated per-module rather
  than shared to keep each module self-contained — both collapse to the same
  `openrouter.ts` import after merge).
- Produces: `const RUN_SCRIPT_DEF: ToolDef`.
- Produces: `class JailViolationError extends Error { attemptedPath: string }` and
  `resolveInJail(workspaceRoot: string, relativePath: string): string` — mirrors the
  runtime-core `jail.ts` exactly (that file doesn't exist in this worktree).
- Produces: `const SCRIPT_TIMEOUT_MS = 60_000`.
- Produces: `runScript(workspaceRoot: string, script: string, args: string[]): { ok: boolean; content: string }`.
- Produces: `runScriptWithTimeout(workspaceRoot: string, script: string, args: string[], timeoutMs: number): { ok: boolean; content: string }`
  — same logic as `runScript` but with an overridable timeout, so tests don't have to wait
  the full 60s production timeout to exercise the kill path. `runScript` calls it with
  `SCRIPT_TIMEOUT_MS`.
- Consumed by: `tools.ts` post-merge (see `INTEGRATION.md`, Task 5).

- [ ] **Step 1: Create the fixture scripts**

```python
print("hello from python")
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/hello.py`.

```javascript
console.log('hello from node');
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/hello.js`.

```python
import sys
print(' '.join(sys.argv[1:]))
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/echo_args.py`.

```python
import sys
print("boom", file=sys.stderr)
sys.exit(1)
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/fail.py`.

```python
import os
print(os.environ.get('OPENROUTER_API_KEY', 'NOT_SET'))
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/print_env.py`.

```python
import time
time.sleep(5)
print("done sleeping")
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/sleep.py`.

```python
print("x" * 200_000)
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/big_output.py`.

```bash
echo "should never run"
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/scripts/unsupported.sh`.

```python
print("should never run")
```

Save as `platform/runner/test/fixtures/scriptWorkspace/stages/01_research/other/notallowed.py`.

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript, runScriptWithTimeout, RUN_SCRIPT_DEF } from '../src/scriptTool.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/scriptWorkspace', import.meta.url));

describe('RUN_SCRIPT_DEF', () => {
  it('describes the run_script tool', () => {
    expect(RUN_SCRIPT_DEF.function.name).toBe('run_script');
    expect(RUN_SCRIPT_DEF.function.parameters).toMatchObject({ required: ['script'] });
  });
});

describe('runScript', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'scripttool-'));
    cpSync(FIXTURE_DIR, workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('runs a Python script under a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/hello.py', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello from python');
  });

  it('runs a Node script under a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/hello.js', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello from node');
  });

  it('passes args through to the script', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/echo_args.py', ['foo', 'bar']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('foo bar');
  });

  it('refuses a script outside a stage scripts/ directory', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/other/notallowed.py', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/scripts/);
  });

  it('refuses a path that escapes the workspace', () => {
    const result = runScript(workspaceRoot, '../../etc/passwd', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/jail/i);
  });

  it('reports a non-zero exit without throwing', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/fail.py', []);
    expect(result.ok).toBe(false);
    expect(result.content).toContain('boom');
  });

  it('does not leak OPENROUTER_API_KEY into the script environment', () => {
    const previous = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'super-secret';
    try {
      const result = runScript(workspaceRoot, 'stages/01_research/scripts/print_env.py', []);
      expect(result.ok).toBe(true);
      expect(result.content).not.toContain('super-secret');
      expect(result.content).toContain('NOT_SET');
    } finally {
      process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it('kills a script that runs past its timeout', () => {
    const result = runScriptWithTimeout(workspaceRoot, 'stages/01_research/scripts/sleep.py', [], 200);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/timed out|timeout/i);
  }, 10_000);

  it('refuses an unsupported script extension', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/unsupported.sh', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/extension/i);
  });

  it('truncates script output over the 100KB cap', () => {
    const result = runScript(workspaceRoot, 'stages/01_research/scripts/big_output.py', []);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(200_000);
  });
});
```

Save as `platform/runner/test/scriptTool.test.ts`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd platform/runner && npx vitest run test/scriptTool.test.ts`
Expected: FAIL — `Cannot find module '../src/scriptTool.js'`.

- [ ] **Step 4: Implement `scriptTool.ts`**

```typescript
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const RUN_SCRIPT_DEF: ToolDef = {
  type: 'function',
  function: {
    name: 'run_script',
    description:
      "Run a deterministic script committed under a stage's scripts/ directory (e.g. stages/02_analysis/scripts/compute.py).",
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Workspace-relative path to the script.' },
        args: { type: 'array', items: { type: 'string' } },
      },
      required: ['script'],
    },
  },
};

// Mirrors platform/runner/src/jail.ts's resolveInJail/JailViolationError. Duplicated
// because that file is owned by a parallel worktree and doesn't exist here yet — collapse
// into a single import after merge (see INTEGRATION.md).
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

const STAGE_SCRIPTS_SEGMENT_INDEX = 2;
export const SCRIPT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 100 * 1024;
const TRUNCATION_MARKER = '\n[... output truncated at 100KB ...]';

function isUnderStageScriptsDir(root: string, resolvedPath: string): boolean {
  const segments = relative(root, resolvedPath).split('/');
  return segments[0] === 'stages' && segments[STAGE_SCRIPTS_SEGMENT_INDEX] === 'scripts' && segments.length >= 4;
}

function interpreterFor(scriptPath: string): string | null {
  const ext = extname(scriptPath);
  if (ext === '.py') return 'python3';
  if (ext === '.js' || ext === '.mjs') return 'node';
  return null;
}

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT_BYTES) return output;
  return output.slice(0, MAX_OUTPUT_BYTES) + TRUNCATION_MARKER;
}

export function runScript(workspaceRoot: string, script: string, args: string[]): { ok: boolean; content: string } {
  return runScriptWithTimeout(workspaceRoot, script, args, SCRIPT_TIMEOUT_MS);
}

export function runScriptWithTimeout(
  workspaceRoot: string,
  script: string,
  args: string[],
  timeoutMs: number
): { ok: boolean; content: string } {
  const root = realpathSync(workspaceRoot);

  let resolved: string;
  try {
    resolved = resolveInJail(root, script);
  } catch (err) {
    return { ok: false, content: err instanceof Error ? err.message : String(err) };
  }

  if (!isUnderStageScriptsDir(root, resolved)) {
    return {
      ok: false,
      content: `Refused: script must live under a stage's scripts/ directory (got "${script}")`,
    };
  }

  const interpreter = interpreterFor(resolved);
  if (!interpreter) {
    return {
      ok: false,
      content: `Refused: unsupported script extension for "${script}" (allowed: .py, .js, .mjs)`,
    };
  }

  try {
    const output = execFileSync(interpreter, [resolved, ...args], {
      cwd: root,
      timeout: timeoutMs,
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf-8',
    });
    return { ok: true, content: truncate(output) };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string | null;
    };
    if (e.killed && e.signal) {
      return { ok: false, content: `Script timed out after ${timeoutMs}ms (killed with ${e.signal})` };
    }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n') || e.message || String(err);
    return { ok: false, content: truncate(combined) };
  }
}
```

Save as `platform/runner/src/scriptTool.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd platform/runner && npx vitest run test/scriptTool.test.ts`
Expected: PASS — 11 tests passed. (The timeout test takes ~200ms plus process-kill overhead,
not a full 60s, because it calls `runScriptWithTimeout` directly.)

- [ ] **Step 6: Commit**

```bash
git add platform/runner/src/scriptTool.ts platform/runner/test/scriptTool.test.ts platform/runner/test/fixtures/scriptWorkspace
git commit -m "runner: add run_script tool for stage scripts/ execution"
```

---

### Task 5: `platform/runner/INTEGRATION.md`

**Files:**
- Create: `platform/runner/INTEGRATION.md`

**Interfaces:**
- Produces: a documentation-only file. No code changes. Written so a human (or agent) can
  apply the hunks verbatim once the runtime-core worktree's `tools.ts`, `agentLoop.ts`, and
  `commands/run.ts` exist and merge.

- [ ] **Step 1: Write `INTEGRATION.md`**

```markdown
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
```

Save as `platform/runner/INTEGRATION.md`.

- [ ] **Step 2: Commit**

```bash
git add platform/runner/INTEGRATION.md
git commit -m "runner: document post-merge integration wiring for config/webTool/scriptTool"
```

---

### Task 6: Contract proposal — `runner.config.json` schema

**Files:**
- Create: `contracts/proposals/runner-config.schema.json`

**Interfaces:**
- Produces: a draft JSON Schema for human review. Not placed in `contracts/schemas/`
  (frozen) — `contracts/proposals/` flags it as pending approval.

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "icm/runner-config-proposal",
  "title": "RunnerConfig (proposed)",
  "description": "Contents of <workspace>/runner.config.json. Committed to the workspace as part of the reproducibility story (docs/mvp-spec.md §5). PROPOSED — not yet a frozen contract; mirrors platform/runner/src/config.ts. See contracts/README.md.",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "model": {
      "type": "string",
      "enum": ["anthropic/claude-sonnet-5", "anthropic/claude-opus-4.8", "openai/gpt-5.2"],
      "description": "Vetted OpenRouter model slug. Defaults to anthropic/claude-sonnet-5 if omitted."
    },
    "tokenBudget": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "description": "Per-run token budget cap. Defaults to 200000 if omitted."
    },
    "allowedDomains": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Outbound fetch_url domain allowlist. Defaults to [] (all fetches refused) if omitted."
    }
  }
}
```

Save as `contracts/proposals/runner-config.schema.json`.

- [ ] **Step 2: Commit**

```bash
git add contracts/proposals/runner-config.schema.json
git commit -m "runner: propose runner.config.json contract schema"
```

---

### Task 7: Final verification

**Files:** none (verification only, no commit).

- [ ] **Step 1: Full typecheck and test run**

Run: `cd platform/runner && npm run typecheck && npm test`
Expected: typecheck passes with no errors; all test files pass (config: 8, webTool: 10,
scriptTool: 11 — 29 tests total).

- [ ] **Step 2: Confirm zero modifications to runtime-core-owned files**

Run: `git diff --stat d2faa1f HEAD`
Expected: every changed path is one of `platform/runner/{package.json,package-lock.json,
tsconfig.json,vitest.config.ts,src/config.ts,src/webTool.ts,src/scriptTool.ts,INTEGRATION.md,
test/...}`, `.gitignore`, or `contracts/proposals/runner-config.schema.json`. No path matches
`platform/runner/src/{jail,lock,tokenBudget,runLog,state,git,openrouter,tools,agentLoop,
cli}.ts`, `platform/runner/src/commands/`, or anything under `contracts/schemas/`,
`contracts/README.md`, `contracts/state-machine.md`, `contracts/openapi.yaml`.

- [ ] **Step 3: Report back**

Summarize for the human: which module commits landed, the blocking contract question from
`INTEGRATION.md` (run-log tool-call enum), and that `INTEGRATION.md`/the contract proposal
are ready for review — nothing further is applied automatically.
