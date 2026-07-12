import express, { type Express } from 'express';
import cors from 'cors';
import type { WorkspaceConfig } from './workspace.js';
import { createPipelineRouter } from './routes/pipeline.js';
import { createStageActionsRouter } from './routes/stageActions.js';
import { createRunsRouter } from './routes/runs.js';
import { createFilesRouter } from './routes/files.js';
import { createTreeDiffLogRouter } from './routes/treeDiffLog.js';
import { createResetRouter } from './routes/reset.js';

export function createApp(config: WorkspaceConfig, options: { runDelayMs?: number } = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createPipelineRouter(config));
  app.use(createStageActionsRouter(config, options));
  app.use(createRunsRouter(config));
  app.use(createFilesRouter(config));
  app.use(createTreeDiffLogRouter(config));
  app.use(createResetRouter(config));
  return app;
}
