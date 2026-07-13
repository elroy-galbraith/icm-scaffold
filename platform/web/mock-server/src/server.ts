import { createApp } from './app.js';
import { DEFAULT_WORKSPACE_CONFIG, seedWorkspace } from './workspace.js';

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4000;

seedWorkspace(DEFAULT_WORKSPACE_CONFIG);

const app = createApp(DEFAULT_WORKSPACE_CONFIG);

app.listen(PORT, () => {
  console.log(`ICM mock server listening on http://localhost:${PORT}`);
  console.log(`Scratch workspace: ${DEFAULT_WORKSPACE_CONFIG.workspaceRoot}`);
});
