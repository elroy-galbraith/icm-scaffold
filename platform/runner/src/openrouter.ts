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
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  apiKey: string;
  maxTokens?: number;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
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
    usage?: { total_tokens?: number };
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error('OpenRouter response had no choices');
  }

  return {
    message: choice.message,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
}

export type ChatCompletionFn = typeof chatCompletion;
