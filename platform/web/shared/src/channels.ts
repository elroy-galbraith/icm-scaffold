import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';

// See schedules.ts / state.ts for why this interop shape is needed under NodeNext.
const addFormats = addFormatsImport as unknown as (ajv: Ajv2020) => void;

export type ChannelAction = 'run' | 'status' | 'approve' | 'reject';

export interface Channel {
  id: string;
  kind: 'http';
  tokenEnvVar: string;
  allowedActions: ChannelAction[];
  enabled: boolean;
  description?: string;
}

export interface ChannelConfig {
  channels: Channel[];
}

export class ChannelsValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid channels config: ${errors.join('; ')}`);
    this.name = 'ChannelsValidationError';
  }
}

const SCHEMAS_DIR = fileURLToPath(new URL('../../../../contracts/schemas', import.meta.url));

function loadSchema(fileName: string): object {
  return JSON.parse(readFileSync(join(SCHEMAS_DIR, fileName), 'utf-8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateShape = ajv.compile(loadSchema('channel-config.schema.json'));

// Human-editable, like schedules.config.json — see schedules.ts for why reads validate too.
function validate(data: unknown): ChannelConfig {
  if (!validateShape(data)) {
    const errors = (validateShape.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim());
    throw new ChannelsValidationError(errors);
  }
  const config = data as ChannelConfig;

  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const channel of config.channels) {
    if (seenIds.has(channel.id)) {
      errors.push(`duplicate channel id: ${channel.id}`);
    }
    seenIds.add(channel.id);
  }
  if (errors.length > 0) {
    throw new ChannelsValidationError(errors);
  }
  return config;
}

function channelsPath(workspaceRoot: string): string {
  return join(workspaceRoot, 'channels.config.json');
}

export function readChannels(workspaceRoot: string): ChannelConfig {
  const path = channelsPath(workspaceRoot);
  if (!existsSync(path)) {
    return { channels: [] };
  }
  return validate(JSON.parse(readFileSync(path, 'utf-8')));
}

export function writeChannels(workspaceRoot: string, config: ChannelConfig): void {
  const validated = validate(config);
  writeFileSync(channelsPath(workspaceRoot), JSON.stringify(validated, null, 2));
}

/**
 * Constant-time token check against the channel's configured env var, so a wrong
 * guess can't be distinguished by response latency. Null covers every failure mode
 * alike (unknown id, disabled, missing env var, wrong token) — callers decide which
 * HTTP status that becomes; this function only answers "is this call who it claims."
 */
export function authenticateChannel(
  channels: ChannelConfig,
  channelId: string,
  providedToken: string | undefined
): Channel | null {
  const channel = channels.channels.find((c) => c.id === channelId);
  if (!channel || !channel.enabled || !providedToken) return null;

  const expected = process.env[channel.tokenEnvVar];
  if (!expected) return null;

  const provided = Buffer.from(providedToken);
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) return null;

  return channel;
}
