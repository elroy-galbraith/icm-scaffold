import { spawn, execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export interface RunnerCli {
  runStageInBackground(workspaceRoot: string, stage: string): void;
  approveStage(workspaceRoot: string, stage: string): Promise<void>;
  rejectStage(workspaceRoot: string, stage: string, comment: string): Promise<void>;
}

// platform/web/server/src/runnerCli.ts -> platform/runner is a sibling of web/.
const RUNNER_DIR = fileURLToPath(new URL('../../../runner', import.meta.url));
const API_KEY_PREFIX = 'OPENROUTER_API_KEY=';

export function loadOpenRouterApiKey(envPath: string = join(RUNNER_DIR, '.env')): string | undefined {
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(API_KEY_PREFIX));
  if (!line) return undefined;
  const value = line.slice(API_KEY_PREFIX.length).trim();
  // A value quoted as OPENROUTER_API_KEY="sk-or-..." (common when a key is
  // copy-pasted from a secrets UI) would otherwise pass the literal quote
  // characters to OpenRouter and fail auth with no clear signal why.
  return value.replace(/^['"]|['"]$/g, '');
}

function runnerEnv(): NodeJS.ProcessEnv {
  const apiKey = loadOpenRouterApiKey();
  return apiKey ? { ...process.env, OPENROUTER_API_KEY: apiKey } : { ...process.env };
}

export function createRunnerCli(runnerDir: string = RUNNER_DIR): RunnerCli {
  return {
    runStageInBackground(workspaceRoot, stage) {
      const child = spawn(
        'npm',
        ['--prefix', runnerDir, 'run', 'runner', '--', 'run', stage, '--workspace', workspaceRoot],
        { env: runnerEnv() }
      );
      child.stdout?.on('data', (chunk) => process.stdout.write(`[runner ${stage}] ${chunk}`));
      child.stderr?.on('data', (chunk) => process.stderr.write(`[runner ${stage}] ${chunk}`));
      child.on('error', (err) => console.error(`[runner ${stage}] failed to start: ${err.message}`));
    },

    approveStage(workspaceRoot, stage) {
      return new Promise((resolve, reject) => {
        execFile(
          'npm',
          ['--prefix', runnerDir, 'run', 'runner', '--', 'approve', stage, '--workspace', workspaceRoot],
          { env: runnerEnv() },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(stderr?.trim() || err.message));
              return;
            }
            resolve();
          }
        );
      });
    },

    rejectStage(workspaceRoot, stage, comment) {
      return new Promise((resolve, reject) => {
        execFile(
          'npm',
          [
            '--prefix',
            runnerDir,
            'run',
            'runner',
            '--',
            'reject',
            stage,
            '--comment',
            comment,
            '--workspace',
            workspaceRoot,
          ],
          { env: runnerEnv() },
          (err, _stdout, stderr) => {
            if (err) {
              reject(new Error(stderr?.trim() || err.message));
              return;
            }
            resolve();
          }
        );
      });
    },
  };
}

export const defaultRunnerCli: RunnerCli = createRunnerCli();
