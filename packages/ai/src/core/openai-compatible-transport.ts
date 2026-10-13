// ============================================================================
// AI Core - OpenAI-compatible chat transport (direct HTTP)
// ============================================================================
//
// Why this exists: the engine pairs `ai@5` with `@ai-sdk/openai@1`. The v1
// provider package builds LanguageModelV1 objects, and AI SDK 5 refuses them
// ("Unsupported model version v1 ... AI SDK 5 only supports models that
// implement specification version v2"). Every `generateText`/`streamText`
// call routed to Cloudflare Workers AI therefore threw before any network
// request, and every QuantMail feature built on `AIEngine` (thread summary,
// reply suggestions, the phishing scan, compose assist, triage …) answered
// HTTP 500 — while the backend's own direct-HTTP Quanty chat worked fine.
//
// Cloudflare's `/ai/v1` endpoint speaks the plain OpenAI wire format, so the
// engine now talks to it directly for tool-free rounds: one small, typed
// fetch with a timeout, the same request/response shape the backend's
// `ai-provider.service.ts` already uses in production.
// ============================================================================

export interface OpenAICompatibleEndpoint {
  /** Base URL that ends before `/chat/completions`, e.g. `…/accounts/<id>/ai/v1`. */
  baseURL: string;
  /** Bearer token. Never logged and never echoed into error messages. */
  apiKey: string;
}

export interface CompatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompatChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface CompatChatResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
}

/** Longest provider error detail kept in a thrown message. */
const MAX_ERROR_DETAIL = 300;

/**
 * Flatten engine messages (plain strings or Vercel content parts) into the
 * string-content OpenAI shape. Only text parts survive; tool parts never
 * reach this transport because the engine keeps tool rounds on the SDK path.
 */
export function toCompatMessages(
  messages: ReadonlyArray<{ role: string; content: string | ReadonlyArray<Record<string, unknown>> }>,
): CompatMessage[] {
  const out: CompatMessage[] = [];
  for (const message of messages) {
    if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    const content =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .map((part) => (part['type'] === 'text' && typeof part['text'] === 'string' ? part['text'] : ''))
            .filter(Boolean)
            .join('\n');
    out.push({ role: message.role, content });
  }
  return out;
}

function chatCompletionsUrl(endpoint: OpenAICompatibleEndpoint): string {
  return `${endpoint.baseURL.replace(/\/+$/, '')}/chat/completions`;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_DETAIL);
  } catch {
    return '';
  }
}

async function post(
  endpoint: OpenAICompatibleEndpoint,
  body: Record<string, unknown>,
  options: CompatChatOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(chatCompletionsUrl(endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${endpoint.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const error = new Error(
      `OpenAI-compatible provider returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    ) as Error & { status: number };
    // `retryWithBackoff` retries on `status` 429/5xx only — keep it visible.
    error.status = response.status;
    throw error;
  }
  return response;
}

/**
 * Reasoning models served on the same endpoint (e.g. DeepSeek R1 distills)
 * prefix the answer with a `<think>…</think>` block — sometimes without the
 * opening tag. Callers parse the answer (JSON, chips), so drop the reasoning.
 */
export function stripReasoning(text: string): string {
  const close = text.lastIndexOf('</think>');
  if (close === -1) return text;
  return text.slice(close + '</think>'.length).trim();
}

/** One non-streaming chat completion. Throws on HTTP errors and empty answers. */
export async function compatChatCompletion(
  endpoint: OpenAICompatibleEndpoint,
  messages: CompatMessage[],
  options: CompatChatOptions,
): Promise<CompatChatResult> {
  const response = await post(
    endpoint,
    {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    },
    options,
  );
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? stripReasoning(raw) : '';
  if (text.trim().length === 0) {
    throw new Error('OpenAI-compatible provider returned an empty completion');
  }
  return {
    text,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
}

/**
 * Streaming chat completion over Server-Sent Events. Yields text deltas as
 * they arrive and finishes on `data: [DONE]` (or when the body ends).
 */
export async function* compatChatCompletionStream(
  endpoint: OpenAICompatibleEndpoint,
  messages: CompatMessage[],
  options: CompatChatOptions,
): AsyncGenerator<string> {
  const response = await post(
    endpoint,
    {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    },
    options,
  );
  if (!response.body) {
    throw new Error('OpenAI-compatible provider returned no stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let parsed: { choices?: Array<{ delta?: { content?: string | null } }> };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // keep-alive comments and partial frames are not content
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
