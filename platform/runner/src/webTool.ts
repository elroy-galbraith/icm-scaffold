import type { ToolDef } from './openrouter.js';

export const FETCH_URL_DEF: ToolDef = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Fetch a URL from an allowlisted domain (https only) and return its readable text content. Used by research stages to pull reference material.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The https URL to fetch.' } },
      required: ['url'],
    },
  },
};

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
const MAX_BYTES = 500 * 1024;
const TRUNCATION_MARKER = '\n\n[... truncated at 500KB ...]';

// SSRF guard: reject IP-literal hosts outright. This does NOT protect against
// DNS rebinding (an allowlisted hostname resolving to a private/loopback address
// at fetch time) — that's a known v2 gap, not covered by this check.
function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  const bare = host.replace(/^\[/, '').replace(/\]$/, '');
  return bare.includes(':');
}

function isAllowedHost(host: string, allowedDomains: string[]): boolean {
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function refusalFor(url: URL, allowedDomains: string[]): string | null {
  if (url.protocol !== 'https:') {
    return `Refused: only https URLs are allowed (got "${url.protocol}")`;
  }
  if (isIpLiteral(url.hostname)) {
    return `Refused: IP-literal hosts are not allowed ("${url.hostname}")`;
  }
  if (allowedDomains.length === 0 || !isAllowedHost(url.hostname, allowedDomains)) {
    return `Refused: domain "${url.hostname}" is not allowlisted`;
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// Decodes the named entities above plus generic decimal (&#233;) and hex (&#xE9;/&#XE9;)
// numeric entities. Malformed or out-of-range numeric entities are left unchanged rather
// than throwing (String.fromCodePoint rejects code points outside the valid Unicode range).
function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const numStr = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = parseInt(numStr, isHex ? 16 : 10);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const lower = entity.toLowerCase();
    return lower in NAMED_ENTITIES ? NAMED_ENTITIES[lower] : match;
  });
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchUrl(url: string, allowedDomains: string[]): Promise<{ ok: boolean; content: string }> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(url);
  } catch {
    return { ok: false, content: `Refused: invalid URL "${url}"` };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const refusal = refusalFor(currentUrl, allowedDomains);
    if (refusal) return { ok: false, content: refusal };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(currentUrl.toString(), { redirect: 'manual', signal: controller.signal });
      } catch (err) {
        return { ok: false, content: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` };
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { ok: false, content: `Redirect response (status ${response.status}) had no Location header` };
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        return { ok: false, content: `Fetch failed with status ${response.status}` };
      }

      const { bytes, truncated } = await readBounded(response, MAX_BYTES);
      const text = new TextDecoder('utf-8').decode(bytes);
      const content = stripHtml(text);
      return { ok: true, content: truncated ? content + TRUNCATION_MARKER : content };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, content: `Refused: exceeded ${MAX_REDIRECTS} redirects` };
}

async function readBounded(response: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    const truncated = buffer.byteLength > maxBytes;
    return { bytes: truncated ? buffer.slice(0, maxBytes) : buffer, truncated };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      const keep = maxBytes - (total - value.byteLength);
      if (keep > 0) chunks.push(value.slice(0, keep));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const size = truncated ? maxBytes : total;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}
