import type { Response } from 'express';
import { readLock, buildPipelineView, type StageStatus, type RunTrigger, type PipelineView } from 'icm-web-shared';
import { checkStageOrder, type WorkspaceConfig } from './workspace.js';
import { readState } from 'icm-web-shared';
import type { RunnerCli } from './runnerCli.js';
import { commitWorkspace } from 'icm-web-shared';

/**
 * The result of one action (run/status/approve/reject), independent of how it was
 * reached. Both the stage-scoped HTTP routes and the channel-actions route perform
 * the same decision (lock? blocked? wrong status?) and just render this to a response
 * their own way — see contracts/README.md's "Schedules & channels" section: a channel
 * can't do anything a human in the web UI couldn't already do.
 */
export interface ActionResult {
  status: number;
  body: unknown;
}

function getStageStatus(config: WorkspaceConfig, stage: string): StageStatus {
  const state = readState(config.workspaceRoot);
  return state.stages[stage]?.status ?? 'pending';
}

export function performRunStage(
  config: WorkspaceConfig,
  runnerCli: RunnerCli,
  stage: string,
  trigger?: RunTrigger
): ActionResult {
  const lock = readLock(config.workspaceRoot);
  if (lock) {
    return { status: 409, body: { runId: lock.runId, stage: lock.stage, acquiredAt: lock.acquiredAt } };
  }

  const currentStatus = getStageStatus(config, stage);
  if (currentStatus === 'awaiting_review') {
    return { status: 422, body: { blockingStage: stage, blockingStatus: currentStatus } };
  }

  const blocked = checkStageOrder(config.workspaceRoot, stage);
  if (blocked) {
    return { status: 422, body: { blockingStage: blocked.blockingStage, blockingStatus: blocked.blockingStatus } };
  }

  runnerCli.runStageInBackground(config.workspaceRoot, stage, trigger);
  return { status: 202, body: undefined };
}

export async function performApproveStage(
  config: WorkspaceConfig,
  runnerCli: RunnerCli,
  stage: string
): Promise<ActionResult> {
  const currentStatus = getStageStatus(config, stage);
  if (currentStatus !== 'awaiting_review') {
    return { status: 409, body: { stage, status: currentStatus } };
  }
  try {
    await runnerCli.approveStage(config.workspaceRoot, stage);
    // See the comment in the pre-extraction stageActions.ts history: the runner CLI's
    // own commit runs before it updates .runner/state.json, so it commits nothing;
    // compensate here so the approval actually lands in the audit trail. No-op once the
    // CLI commits the change itself.
    commitWorkspace(config.workspaceRoot, `stage ${stage}: approved`);
    return { status: 200, body: {} };
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export async function performRejectStage(
  config: WorkspaceConfig,
  runnerCli: RunnerCli,
  stage: string,
  comment: string
): Promise<ActionResult> {
  if (comment.length < 1) {
    return { status: 422, body: { error: 'comment is required' } };
  }
  const currentStatus = getStageStatus(config, stage);
  if (currentStatus !== 'awaiting_review') {
    return { status: 409, body: { stage, status: currentStatus } };
  }
  try {
    await runnerCli.rejectStage(config.workspaceRoot, stage, comment);
    // The runner CLI's reject command never commits at all; compensate here so the
    // rejection lands in the audit trail. No-op once the CLI commits it itself.
    commitWorkspace(config.workspaceRoot, `stage ${stage}: rejected — ${comment}`);
    return { status: 200, body: {} };
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

export function performStatus(config: WorkspaceConfig): ActionResult {
  const pipeline: PipelineView = buildPipelineView(config.workspaceRoot);
  return { status: 200, body: pipeline };
}

export function sendActionResult(res: Response, result: ActionResult): void {
  if (result.body === undefined) {
    res.status(result.status).end();
    return;
  }
  res.status(result.status).json(result.body);
}
