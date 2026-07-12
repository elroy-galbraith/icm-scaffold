import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getPipeline,
  runStage,
  approveStage,
  rejectStage,
  getRun,
  getFile,
  putFile,
  getTree,
  getDiff,
  getLog,
  ApiError,
} from './client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getPipeline GETs /api/pipeline and returns the parsed body', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/pipeline');
      return jsonResponse({ locked: false, stages: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pipeline = await getPipeline();
    expect(pipeline.locked).toBe(false);
  });

  it('runStage POSTs to /api/stages/:stage/run and resolves on a 202 with no body', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/stages/03_report/run');
      expect(init?.method).toBe('POST');
      return new Response('', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runStage('03_report')).resolves.toBeUndefined();
  });

  it('rejectStage sends the comment as JSON', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/stages/02_analysis/reject');
      expect(JSON.parse(init?.body as string)).toEqual({ comment: 'too shallow' });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await rejectStage('02_analysis', 'too shallow');
  });

  it('approveStage POSTs to /api/stages/:stage/approve', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/stages/01_research/approve');
      expect(init?.method).toBe('POST');
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await approveStage('01_research');
  });

  it('getFile encodes the path query parameter', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/files?path=shared%2Fclient-brief.md');
      return jsonResponse({ path: 'shared/client-brief.md', content: 'Hi' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await getFile('shared/client-brief.md');
    expect(file.content).toBe('Hi');
  });

  it('putFile PUTs content as JSON to the same path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/files?path=shared%2Fclient-brief.md');
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(init?.body as string)).toEqual({ content: 'New content' });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    await putFile('shared/client-brief.md', 'New content');
  });

  it('getDiff defaults ref to HEAD~1', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/diff?path=report.md&ref=HEAD~1');
      return jsonResponse({ path: 'report.md', ref: 'HEAD~1', diff: '' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await getDiff('report.md');
  });

  it('getLog defaults limit to 50', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('/api/log?limit=50');
      return jsonResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await getLog();
  });

  it('getRun and getTree hit the expected paths', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/runs/run-1') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/tree') return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect((await getRun('run-1')).runId).toBe('run-1');
    expect(await getTree()).toEqual([]);
  });

  it('throws ApiError with the status and parsed body on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ blockingStage: '02_analysis', blockingStatus: 'pending' }, 422))
    );

    await expect(runStage('03_report')).rejects.toMatchObject({
      status: 422,
      body: { blockingStage: '02_analysis', blockingStatus: 'pending' },
    });
  });

  it('ApiError is both an ApiError and an Error even with no JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })));
    try {
      await approveStage('01_research');
      throw new Error('expected ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toBeInstanceOf(Error);
      expect((err as ApiError).status).toBe(409);
    }
  });
});
