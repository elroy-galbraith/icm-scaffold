#!/usr/bin/env node
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { approveCommand } from './commands/approve.js';
import { rejectCommand } from './commands/reject.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  runner run <stage> [--workspace <path>] [--force]',
      '  runner status [--workspace <path>]',
      '  runner approve <stage> [--workspace <path>]',
      '  runner reject <stage> --comment "<text>" [--workspace <path>]',
    ].join('\n')
  );
  process.exit(1);
}

function parseWorkspaceFlag(args: string[]): { workspaceRoot: string; rest: string[] } {
  const idx = args.indexOf('--workspace');
  if (idx === -1) {
    return { workspaceRoot: process.cwd(), rest: args };
  }
  const workspaceRoot = args[idx + 1];
  if (!workspaceRoot) usage();
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { workspaceRoot, rest };
}

function parseForceFlag(args: string[]): { force: boolean; rest: string[] } {
  const idx = args.indexOf('--force');
  if (idx === -1) {
    return { force: false, rest: args };
  }
  const rest = [...args.slice(0, idx), ...args.slice(idx + 1)];
  return { force: true, rest };
}

function parseCommentFlag(args: string[]): { comment: string; rest: string[] } {
  const idx = args.indexOf('--comment');
  if (idx === -1 || !args[idx + 1]) usage();
  const comment = args[idx + 1];
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { comment, rest };
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { workspaceRoot, rest } = parseWorkspaceFlag(rawArgs);

  switch (command) {
    case 'run': {
      const { force, rest: rest2 } = parseForceFlag(rest);
      const [stage] = rest2;
      if (!stage) usage();
      await runCommand(workspaceRoot, stage, { force });
      break;
    }
    case 'status': {
      statusCommand(workspaceRoot);
      break;
    }
    case 'approve': {
      const [stage] = rest;
      if (!stage) usage();
      approveCommand(workspaceRoot, stage);
      break;
    }
    case 'reject': {
      const { comment, rest: rest2 } = parseCommentFlag(rest);
      const [stage] = rest2;
      if (!stage) usage();
      rejectCommand(workspaceRoot, stage, comment);
      break;
    }
    default:
      usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
