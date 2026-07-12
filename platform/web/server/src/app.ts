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
