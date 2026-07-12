import { TOOL_DEFS, createToolContext, executeTool, type ToolContext } from './tools.js';
import { TokenBudget, BudgetExceededError } from './tokenBudget.js';
import { chatCompletion as defaultChatCompletion, type ChatCompletionFn, type ChatMessage } from './openrouter.js';
import type { RunStatus, ToolCallLogEntry } from './runLog.js';

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5';
export const DEFAULT_TOKEN_BUDGET = 200_000;
export const DEFAULT_MAX_TOKENS = 16384;
const MAX_TOOL_ERROR_RETRIES = 3;
const MAX_ITERATIONS = 50;

export interface AgentLoopParams {
  workspaceRoot: string;
  stage: string;
  model?: string;
  apiKey: string;
  tokenBudget?: number;
  maxTokens?: number;
  chatCompletionFn?: ChatCompletionFn;
  allowedDomains?: string[];
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
  // Not part of the run-log contract (contracts/schemas/run-log.schema.json is frozen
  // with additionalProperties: false) — surfaced to the CLI for cost visibility only.
  cachedTokens: number;
  cacheWriteTokens: number;
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
  const maxTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  const chat = params.chatCompletionFn ?? defaultChatCompletion;
  const budget = new TokenBudget(tokenBudgetLimit);
  const ctx: ToolContext = createToolContext(params.workspaceRoot, params.allowedDomains ?? []);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(params.stage) },
    { role: 'user', content: `Run stage "${params.stage}".` },
  ];

  let toolErrorStreak = 0;
  let cachedTokens = 0;
  let cacheWriteTokens = 0;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await chat({ model, messages, tools: TOOL_DEFS, apiKey: params.apiKey, maxTokens });
      budget.add(response.totalTokens);
      cachedTokens += response.cachedTokens ?? 0;
      cacheWriteTokens += response.cacheWriteTokens ?? 0;
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
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch (err) {
          // The model's tool-call arguments can be truncated mid-generation if the
          // response hits maxTokens before finishing (most commonly on large
          // write_file calls). Treat that exactly like a failed tool execution
          // (executeTool's `{ ok: false, content }` shape) instead of letting the
          // SyntaxError propagate to the outer try/catch and abort the whole run.
          const parseErrorMessage = err instanceof Error ? err.message : String(err);
          const content = `Invalid tool call arguments (possibly truncated): ${parseErrorMessage}. If you intended a large write_file call, try writing shorter content or splitting it across multiple calls.`;

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content,
          });

          // Record it in the run log for debuggability, mirroring executeTool's own
          // (unchecked) cast of the tool name into ToolCallLogEntry['tool']. There are
          // no valid parsed args, so the raw (truncated) argument string is logged instead.
          ctx.toolCalls.push({
            tool: call.function.name as ToolCallLogEntry['tool'],
            args: { rawArguments: call.function.arguments },
            result: 'error',
            errorMessage: content,
            timestamp: new Date().toISOString(),
          });

          toolErrorStreak++;
          if (toolErrorStreak > MAX_TOOL_ERROR_RETRIES) {
            return finish(
              'error',
              ctx,
              budget,
              model,
              tokenBudgetLimit,
              cachedTokens,
              cacheWriteTokens,
              `Too many consecutive tool errors; last error: ${content}`
            );
          }
          continue;
        }

        const result = await executeTool(call.function.name, args, ctx);
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
              cachedTokens,
              cacheWriteTokens,
              `Too many consecutive tool errors; last error: ${result.content}`
            );
          }
        } else {
          toolErrorStreak = 0;
        }
      }

      if (ctx.finished) {
        return finish('completed', ctx, budget, model, tokenBudgetLimit, cachedTokens, cacheWriteTokens);
      }
    }

    return finish(
      'error',
      ctx,
      budget,
      model,
      tokenBudgetLimit,
      cachedTokens,
      cacheWriteTokens,
      `Exceeded ${MAX_ITERATIONS} loop iterations without finishing`
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return finish('aborted_budget', ctx, budget, model, tokenBudgetLimit, cachedTokens, cacheWriteTokens, err.message);
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    return finish('error', ctx, budget, model, tokenBudgetLimit, cachedTokens, cacheWriteTokens, errorMessage);
  }
}

function finish(
  status: RunStatus,
  ctx: ToolContext,
  budget: TokenBudget,
  model: string,
  tokenBudgetLimit: number,
  cachedTokens: number,
  cacheWriteTokens: number,
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
    cachedTokens,
    cacheWriteTokens,
  };
}
