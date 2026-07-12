import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface TreeEntry {
  path: string;
  type: 'file' | 'dir';
}

export interface LogEntry {
  sha: string;
  message: string;
  date: string;
}

export interface DiffResult {
  path: string;
  ref: string;
  diff: string;
}

const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules']);

export function commitWorkspace(workspaceRoot: string, message: string): string {
  execFileSync('git', ['add', '-A'], { cwd: workspaceRoot });
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot }).toString();
  if (status.trim().length === 0) {
    return currentHead(workspaceRoot);
  }
  execFileSync('git', ['commit', '-m', message], { cwd: workspaceRoot });
  return currentHead(workspaceRoot);
}

export function currentHead(workspaceRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot }).toString().trim();
}

export function getTree(workspaceRoot: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  walk(workspaceRoot, workspaceRoot, entries);
  return entries;
}

function walk(root: string, dir: string, entries: TreeEntry[]): void {
  for (const name of readdirSync(dir).sort()) {
    if (EXCLUDED_DIR_NAMES.has(name)) continue;
    const fullPath = join(dir, name);
    const relPath = relative(root, fullPath).split(sep).join('/');
    const isDir = statSync(fullPath).isDirectory();
    entries.push({ path: relPath, type: isDir ? 'dir' : 'file' });
    if (isDir) {
      walk(root, fullPath, entries);
    }
  }
}

export class InvalidRefError extends Error {}

/**
 * `ref` is passed to `git diff` as a positional argument before the `--` path
 * separator. Any value starting with `-` is parsed by git as an OPTION, not a
 * revision (e.g. `--output=/tmp/x` makes git write the diff to an
 * attacker-chosen filesystem path instead of stdout). No legitimate git
 * ref/revision ever starts with a hyphen, so rejecting that is sufficient and
 * safe. This check must happen here, since this is the function that
 * actually shells out to git.
 */
function assertSafeRef(ref: string): void {
  if (ref.startsWith('-')) {
    throw new InvalidRefError(`invalid ref: ${ref}`);
  }
}

export function getDiff(workspaceRoot: string, path: string, ref: string): DiffResult {
  assertSafeRef(ref);
  try {
    const diff = execFileSync('git', ['diff', ref, '--', path], {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { path, ref, diff };
  } catch (err) {
    if (err instanceof InvalidRefError) throw err;
    return { path, ref, diff: '' };
  }
}

export function getLog(workspaceRoot: string, limit: number): LogEntry[] {
  const format = '%H%x1f%s%x1f%cI';
  const output = execFileSync('git', ['log', `-n`, String(limit), `--pretty=format:${format}`], {
    cwd: workspaceRoot,
  }).toString();
  if (output.trim().length === 0) return [];
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha, message, date] = line.split('\x1f');
      return { sha, message, date: new Date(date).toISOString() };
    });
}
