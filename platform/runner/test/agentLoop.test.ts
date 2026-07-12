import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgentLoop, DEFAULT_MAX_TOKENS } from '../src/agentLoop.js';
import type { ChatCompletionFn, ChatCompletionParams, ChatCompletionResult } from '../src/openrouter.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/workspace', import.meta.url));

interface ScriptStep {
  toolCalls?: Array<{ name: string; args?: Record<string, unknown>; rawArguments?: string }>;
  totalTokens: number;
}

function scriptedChat(script: ScriptStep[], onCall?: (params: ChatCompletionParams) => void): ChatCompletionFn {
  let call = 0;
  return async (params: ChatCompletionParams): Promise<ChatCompletionResult> => {
    onCall?.(params);
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
          function: { name: tc.name, arguments: tc.rawArguments ?? JSON.stringify(tc.args ?? {}) },
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

  it('passes the default max_tokens to every chat call when no override is given', async () => {
    const capturedParams: ChatCompletionParams[] = [];
    const chat = scriptedChat(
      [
        { toolCalls: [{ name: 'read_file', args: { path: 'CLAUDE.md' } }], totalTokens: 50 },
        {
          toolCalls: [
            { name: 'finish_stage', args: { gateSummary: 'Done. Verify: nothing to check.' } },
          ],
          totalTokens: 30,
        },
      ],
      (params) => capturedParams.push(params)
    );

    const result = await runAgentLoop({
      workspaceRoot,
      stage: '01_research',
      apiKey: 'test-key',
      chatCompletionFn: chat,
    });

    expect(result.status).toBe('completed');
    expect(capturedParams.length).toBeGreaterThan(0);
    for (const params of capturedParams) {
      expect(params.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    }
  });

  it('passes a custom maxTokens override to every chat call when provided', async () => {
    const capturedParams: ChatCompletionParams[] = [];
    const chat = scriptedChat(
      [
        {
          toolCalls: [
            { name: 'finish_stage', args: { gateSummary: 'Done. Verify: nothing to check.' } },
          ],
          totalTokens: 30,
        },
      ],
      (params) => capturedParams.push(params)
    );

    const result = await runAgentLoop({
      workspaceRoot,
      stage: '01_research',
      apiKey: 'test-key',
      chatCompletionFn: chat,
      maxTokens: 1000,
    });

    expect(result.status).toBe('completed');
    expect(capturedParams.length).toBeGreaterThan(0);
    for (const params of capturedParams) {
      expect(params.maxTokens).toBe(1000);
    }
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

  it('recovers from a truncated/invalid write_file tool-call JSON instead of aborting the run', async () => {
    const chat = scriptedChat([
      {
        toolCalls: [
          {
            name: 'write_file',
            rawArguments: '{"path": "output/findings.md", "content": "some unterminated',
          },
        ],
        totalTokens: 80,
      },
      {
        toolCalls: [
          {
            name: 'write_file',
            args: { path: 'stages/01_research/output/findings.md', content: '# Findings\n' },
          },
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

    expect(result.status).not.toBe('error');
    expect(result.status).toBe('completed');
    expect(result.filesWritten).toContain('stages/01_research/output/findings.md');
    expect(
      result.toolCalls.some(
        (tc) => tc.result === 'error' && tc.errorMessage?.includes('possibly truncated')
      )
    ).toBe(true);
  });

  it('aborts with status error when truncated tool-call JSON repeats past the retry limit', async () => {
    // MAX_TOOL_ERROR_RETRIES is 3 (not exported); one more failure than that must abort.
    const truncatedStep = {
      toolCalls: [
        {
          name: 'write_file',
          rawArguments: '{"path": "output/findings.md", "content": "some unterminated',
        },
      ],
      totalTokens: 20,
    };
    const chat = scriptedChat([truncatedStep, truncatedStep, truncatedStep, truncatedStep]);

    const result = await runAgentLoop({
      workspaceRoot,
      stage: '01_research',
      apiKey: 'test-key',
      chatCompletionFn: chat,
    });

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('Too many consecutive tool errors');
  });
});
