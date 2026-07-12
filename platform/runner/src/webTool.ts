export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
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
    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), { redirect: 'manual', signal: controller.signal });
    } catch (err) {
      return { ok: false, content: `Fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      clearTimeout(timeout);
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

    const buffer = await response.arrayBuffer();
    const truncated = buffer.byteLength > MAX_BYTES;
    const bytes = truncated ? buffer.slice(0, MAX_BYTES) : buffer;
    const text = new TextDecoder('utf-8').decode(bytes);
    const content = stripHtml(text);
    return { ok: true, content: truncated ? content + TRUNCATION_MARKER : content };
  }

  return { ok: false, content: `Refused: exceeded ${MAX_REDIRECTS} redirects` };
}
