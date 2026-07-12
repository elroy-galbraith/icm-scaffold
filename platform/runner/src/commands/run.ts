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
