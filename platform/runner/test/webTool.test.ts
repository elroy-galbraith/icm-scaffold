import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUrl, FETCH_URL_DEF } from '../src/webTool.js';

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

describe('FETCH_URL_DEF', () => {
  it('describes the fetch_url tool', () => {
    expect(FETCH_URL_DEF.function.name).toBe('fetch_url');
    expect(FETCH_URL_DEF.function.parameters).toMatchObject({
      type: 'object',
      required: ['url'],
    });
  });
});

describe('fetchUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds for an allowlisted domain and strips HTML tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('<p>hello</p>')));
    const result = await fetchUrl('https://example.com/page', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('hello');
    expect(result.content).not.toContain('<p>');
  });

  it('allows a subdomain of an allowlisted domain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('docs page')));
    const result = await fetchUrl('https://docs.example.com/page', ['example.com']);
    expect(result.ok).toBe(true);
  });

  it('refuses a domain that merely shares a suffix', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('nope'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://notexample.com/page', ['example.com']);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when the allowlist is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com', []);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/not allowlisted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-https URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('http://example.com', ['example.com']);
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/https/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses IP-literal hosts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://127.0.0.1/', ['127.0.0.1']);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a redirect to another allowlisted host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse('', 302, { location: 'https://docs.example.com/final' }))
      .mockResolvedValueOnce(htmlResponse('final content'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com/start', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('final content');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect to a non-allowlisted host', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(htmlResponse('', 302, { location: 'https://evil.com/steal' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchUrl('https://example.com/start', ['example.com']);
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('truncates content over the 500KB cap with a marker', async () => {
    const big = 'a'.repeat(600 * 1024);
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(big)));
    const result = await fetchUrl('https://example.com/big', ['example.com']);
    expect(result.ok).toBe(true);
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(600 * 1024);
  });
});
