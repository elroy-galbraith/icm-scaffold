import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChannels, writeChannels, authenticateChannel, ChannelsValidationError, type ChannelConfig } from '../src/channels.js';

describe('channels', () => {
  let workspaceRoot: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'channels-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('returns an empty list when no channels.config.json exists', () => {
    expect(readChannels(workspaceRoot)).toEqual({ channels: [] });
  });

  it('writes and reads back a valid channel', () => {
    const config: ChannelConfig = {
      channels: [
        { id: 'ops-bot', kind: 'http', tokenEnvVar: 'ICM_CHANNEL_OPS_BOT_TOKEN', allowedActions: ['status', 'run'], enabled: true },
      ],
    };
    writeChannels(workspaceRoot, config);
    expect(readChannels(workspaceRoot)).toEqual(config);
  });

  it('rejects duplicate channel ids', () => {
    const config: ChannelConfig = {
      channels: [
        { id: 'dup', kind: 'http', tokenEnvVar: 'A', allowedActions: ['status'], enabled: true },
        { id: 'dup', kind: 'http', tokenEnvVar: 'B', allowedActions: ['status'], enabled: true },
      ],
    };
    expect(() => writeChannels(workspaceRoot, config)).toThrow(ChannelsValidationError);
  });

  it('rejects a shape that fails the JSON schema (missing required field)', () => {
    expect(() => writeChannels(workspaceRoot, { channels: [{ id: 'x' }] } as unknown as ChannelConfig)).toThrow(
      ChannelsValidationError
    );
  });

  it('a hand-edited file that fails validation raises on read too, not just write', () => {
    writeFileSync(join(workspaceRoot, 'channels.config.json'), JSON.stringify({ channels: [{ id: 'x' }] }));
    expect(() => readChannels(workspaceRoot)).toThrow(ChannelsValidationError);
  });

  describe('authenticateChannel', () => {
    const config: ChannelConfig = {
      channels: [
        { id: 'ops-bot', kind: 'http', tokenEnvVar: 'TEST_TOKEN', allowedActions: ['status'], enabled: true },
        { id: 'disabled-bot', kind: 'http', tokenEnvVar: 'TEST_TOKEN_2', allowedActions: ['status'], enabled: false },
      ],
    };

    beforeEach(() => {
      process.env.TEST_TOKEN = 'correct-horse-battery-staple';
      process.env.TEST_TOKEN_2 = 'whatever';
    });

    it('authenticates with the correct token', () => {
      expect(authenticateChannel(config, 'ops-bot', 'correct-horse-battery-staple')?.id).toBe('ops-bot');
    });

    it('rejects a wrong token', () => {
      expect(authenticateChannel(config, 'ops-bot', 'wrong')).toBeNull();
    });

    it('rejects a wrong-length token', () => {
      expect(authenticateChannel(config, 'ops-bot', 'x')).toBeNull();
    });

    it('rejects a missing token', () => {
      expect(authenticateChannel(config, 'ops-bot', undefined)).toBeNull();
    });

    it('rejects an unknown channel id', () => {
      expect(authenticateChannel(config, 'nope', 'correct-horse-battery-staple')).toBeNull();
    });

    it('rejects a disabled channel even with the right token', () => {
      expect(authenticateChannel(config, 'disabled-bot', 'whatever')).toBeNull();
    });

    it('rejects when the token env var is unset', () => {
      delete process.env.TEST_TOKEN;
      expect(authenticateChannel(config, 'ops-bot', 'correct-horse-battery-staple')).toBeNull();
    });
  });
});
