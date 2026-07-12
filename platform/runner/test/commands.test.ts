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
