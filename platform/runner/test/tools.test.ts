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

  it('writes then reads a file, tracking both sets', async () => {
    const ctx = createToolContext(workspaceRoot);
    const writeResult = await executeTool('write_file', { path: 'output/findings.md', content: '# Findings' }, ctx);
    expect(writeResult.ok).toBe(true);

    const readResult = await executeTool('read_file', { path: 'output/findings.md' }, ctx);
    expect(readResult.ok).toBe(true);
    expect(readResult.content).toBe('# Findings');

    expect(ctx.filesWritten.has('output/findings.md')).toBe(true);
    expect(ctx.filesRead.has('output/findings.md')).toBe(true);
    expect(ctx.toolCalls).toHaveLength(2);
  });

  it('lists directory entries, marking directories with a trailing slash', async () => {
    mkdirSync(join(workspaceRoot, 'stages'));
    writeFileSync(join(workspaceRoot, 'CLAUDE.md'), '# root');
    const ctx = createToolContext(workspaceRoot);
    const result = await executeTool('list_dir', { path: '.' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.content.split('\n')).toEqual(expect.arrayContaining(['stages/', 'CLAUDE.md']));
  });

  it('marks the context finished on finish_stage', async () => {
    const ctx = createToolContext(workspaceRoot);
    const result = await executeTool('finish_stage', { gateSummary: 'Done. Verify: ok.' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.finished).toBe(true);
    expect(ctx.gateSummary).toBe('Done. Verify: ok.');
  });

  it('returns ok:false without throwing when a file is missing', async () => {
    const ctx = createToolContext(workspaceRoot);
    const result = await executeTool('read_file', { path: 'missing.md' }, ctx);
    expect(result.ok).toBe(false);
    expect(ctx.toolCalls[0].result).toBe('error');
  });

  it('returns ok:false without throwing on a jail violation', async () => {
    const ctx = createToolContext(workspaceRoot);
    const result = await executeTool('read_file', { path: '../secret.txt' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/jail/i);
  });
});
