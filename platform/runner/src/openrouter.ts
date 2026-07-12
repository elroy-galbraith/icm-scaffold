export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionResult {
  message: ChatMessage;
  totalTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  apiKey: string;
  maxTokens?: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Anthropic (via OpenRouter) supports explicit prompt-cache breakpoints; other
// providers behind OpenRouter's OpenAI-compatible surface don't accept the
// cache_control field, so caching is only attempted for Anthropic model slugs.
export function supportsPromptCaching(model: string): boolean {
  return model.startsWith('anthropic/');
}

interface WireTextPart {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface WireMessage extends Omit<ChatMessage, 'content'> {
  content: string | WireTextPart[];
}

// Anthropic requires array-based content to attach cache_control to a block, and
// OpenRouter forbids mixing string and array content within one request — so once
// any message needs a breakpoint, every message's content is converted to array form.
// Breakpoints go on the system prompt (static, reused verbatim every turn) and on the
// last contentful message (a rolling checkpoint: everything up to here gets cached for
// the next turn, since agentLoop only ever appends to the message list).
function withCacheBreakpoints(messages: ChatMessage[]): WireMessage[] {
  const systemIndex = messages.findIndex((m) => m.role === 'system');
  let lastContentfulIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].content) {
      lastContentfulIndex = i;
      break;
    }
  }
  const breakpointIndices = new Set([systemIndex, lastContentfulIndex].filter((i) => i >= 0));

  return messages.map((message, index) => {
    const { content, ...rest } = message;
    if (!content) {
      return { ...rest, content: [] };
    }
    const part: WireTextPart = { type: 'text', text: content };
    if (breakpointIndices.has(index)) {
      part.cache_control = { type: 'ephemeral' };
    }
    return { ...rest, content: [part] };
  });
}

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const useCache = supportsPromptCaching(params.model);
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: useCache ? withCacheBreakpoints(params.messages) : params.messages,
      tools: params.tools,
      ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: ChatMessage }>;
    usage?: {
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    };
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error('OpenRouter response had no choices');
  }

  return {
    message: choice.message,
    totalTokens: data.usage?.total_tokens ?? 0,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: data.usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
  };
}

export type ChatCompletionFn = typeof chatCompletion;
