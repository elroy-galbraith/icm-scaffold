import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, ConfigError, VETTED_MODELS } from '../src/config.js';

describe('loadConfig', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'config-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns defaults when runner.config.json is missing', () => {
    const config = loadConfig(workspaceRoot);
    expect(config).toEqual({
      model: 'anthropic/claude-sonnet-5',
      tokenBudget: 200_000,
      allowedDomains: [],
    });
  });

  it('merges a partial file over the defaults', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ tokenBudget: 50_000 }));
    const config = loadConfig(workspaceRoot);
    expect(config.model).toBe('anthropic/claude-sonnet-5');
    expect(config.tokenBudget).toBe(50_000);
    expect(config.allowedDomains).toEqual([]);
  });

  it('accepts a fully specified config', () => {
    writeFileSync(
      join(workspaceRoot, 'runner.config.json'),
      JSON.stringify({ model: 'openai/gpt-5.2', tokenBudget: 10_000, allowedDomains: ['example.com'] })
    );
    const config = loadConfig(workspaceRoot);
    expect(config).toEqual({ model: 'openai/gpt-5.2', tokenBudget: 10_000, allowedDomains: ['example.com'] });
  });

  it('throws ConfigError naming "model" for a non-vetted model', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ model: 'meta/llama-4' }));
    expect(() => loadConfig(workspaceRoot)).toThrow(ConfigError);
    expect(() => loadConfig(workspaceRoot)).toThrow(/model/);
  });

  it('throws ConfigError naming "tokenBudget" for a non-positive budget', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ tokenBudget: -5 }));
    expect(() => loadConfig(workspaceRoot)).toThrow(/tokenBudget/);
  });

  it('throws ConfigError naming "allowedDomains" when not an array of strings', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), JSON.stringify({ allowedDomains: ['ok', 5] }));
    expect(() => loadConfig(workspaceRoot)).toThrow(/allowedDomains/);
  });

  it('throws ConfigError for malformed JSON', () => {
    writeFileSync(join(workspaceRoot, 'runner.config.json'), '{ not json');
    expect(() => loadConfig(workspaceRoot)).toThrow(ConfigError);
  });

  it('exposes exactly the three vetted models', () => {
    expect(VETTED_MODELS).toEqual(['anthropic/claude-sonnet-5', 'anthropic/claude-opus-4.8', 'openai/gpt-5.2']);
  });
});
