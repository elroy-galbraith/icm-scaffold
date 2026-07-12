import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunnerConfig {
  model: string;
  tokenBudget: number;
  allowedDomains: string[];
}

export const VETTED_MODELS: string[] = [
  'anthropic/claude-sonnet-5',
  'anthropic/claude-opus-4.8',
  'openai/gpt-5.2',
];

const DEFAULTS: RunnerConfig = {
  model: 'anthropic/claude-sonnet-5',
  tokenBudget: 200_000,
  allowedDomains: [],
};

export class ConfigError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Invalid runner.config.json field "${field}": ${message}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(workspaceRoot: string): RunnerConfig {
  const path = join(workspaceRoot, 'runner.config.json');
  if (!existsSync(path)) {
    return { ...DEFAULTS, allowedDomains: [...DEFAULTS.allowedDomains] };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new ConfigError('<root>', 'runner.config.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('<root>', 'runner.config.json must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const config: RunnerConfig = { ...DEFAULTS, allowedDomains: [...DEFAULTS.allowedDomains] };

  if ('model' in obj) {
    if (typeof obj.model !== 'string' || !VETTED_MODELS.includes(obj.model)) {
      throw new ConfigError('model', `must be one of: ${VETTED_MODELS.join(', ')}`);
    }
    config.model = obj.model;
  }

  if ('tokenBudget' in obj) {
    if (typeof obj.tokenBudget !== 'number' || !Number.isFinite(obj.tokenBudget) || obj.tokenBudget <= 0) {
      throw new ConfigError('tokenBudget', 'must be a positive finite number');
    }
    config.tokenBudget = obj.tokenBudget;
  }

  if ('allowedDomains' in obj) {
    if (!Array.isArray(obj.allowedDomains) || !obj.allowedDomains.every((d) => typeof d === 'string')) {
      throw new ConfigError('allowedDomains', 'must be an array of strings');
    }
    config.allowedDomains = obj.allowedDomains as string[];
  }

  return config;
}
