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

  it('marks the system message and the last contentful message with cache breakpoints for Anthropic models', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages).toEqual([
        {
          role: 'system',
          content: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
        },
        { role: 'user', content: [{ type: 'text', text: 'first turn' }] },
        {
          role: 'user',
          content: [{ type: 'text', text: 'latest turn', cache_control: { type: 'ephemeral' } }],
        },
      ]);
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
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'first turn' },
        { role: 'user', content: 'latest turn' },
      ],
      tools: [],
      apiKey: 'test-key',
    });
  });

  it('leaves an empty-content message as an empty content array rather than an empty text block', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages[0].content).toEqual([]);
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
      messages: [{ role: 'assistant', content: '', tool_calls: [] }],
      tools: [],
      apiKey: 'test-key',
    });
  });

  it('does not rewrite message content for non-Anthropic models', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
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
      model: 'openai/gpt-5.2',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });
  });

  it('parses cached and cache-write token counts from usage.prompt_tokens_details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'hello' } }],
            usage: {
              total_tokens: 100,
              prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 15 },
            },
          }),
          { status: 200 }
        )
      )
    );

    const result = await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });

    expect(result.cachedTokens).toBe(80);
    expect(result.cacheWriteTokens).toBe(15);
  });

  it('defaults cached and cache-write token counts to 0 when usage details are absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'hello' } }],
            usage: { total_tokens: 10 },
          }),
          { status: 200 }
        )
      )
    );

    const result = await chatCompletion({
      model: 'anthropic/claude-sonnet-5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      apiKey: 'test-key',
    });

    expect(result.cachedTokens).toBe(0);
    expect(result.cacheWriteTokens).toBe(0);
  });
});
