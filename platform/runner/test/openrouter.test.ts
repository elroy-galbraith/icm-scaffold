import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatCompletion } from '../src/openrouter.js';

describe('chatCompletion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends model/messages/tools and parses the response', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('anthropic/claude-sonnet-5');
      expect(body.messages).toHaveLength(1);
      expect(body.tools).toHaveLength(0);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'hello' } }],
          usage: { total_tokens: 42 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });

    expect(result.message.content).toBe('hello');
    expect(result.totalTokens).toBe(42);
  });

  it('includes max_tokens in the request body when provided', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.max_tokens).toBe(4096);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'hello' } }],
          usage: { total_tokens: 10 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
      maxTokens: 4096,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('omits max_tokens from the request body when not provided', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect('max_tokens' in body).toBe(false);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'hello' } }],
          usage: { total_tokens: 10 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws with the response body when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 }))
    );

    await expect(
      chatCompletion({ model: 'm', messages: [], tools: [], apiKey: 'k' })
    ).rejects.toThrow(/429/);
  });
});
