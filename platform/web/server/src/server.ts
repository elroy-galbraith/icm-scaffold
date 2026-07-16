import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.js';
import { seedRealWorkspace } from './workspace.js';
import { defaultRunnerCli } from './runnerCli.js';
import { startScheduler } from './scheduler.js';

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4000;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? join(tmpdir(), 'icm-web-live-workspace');

seedRealWorkspace(WORKSPACE_ROOT);

const app = createApp({ workspaceRoot: WORKSPACE_ROOT });
startScheduler({ workspaceRoot: WORKSPACE_ROOT }, defaultRunnerCli);

app.listen(PORT, () => {
  console.log(`ICM real web backend listening on http://localhost:${PORT}`);
  console.log(`Live workspace: ${WORKSPACE_ROOT}`);
});
