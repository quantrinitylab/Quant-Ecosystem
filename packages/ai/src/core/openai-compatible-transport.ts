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
  /**
   * Bearer token. Never logged and never echoed into error messages.
   * Optional: when absent (e.g. the staging `AI_PROVIDER=custom` worker),
   * no Authorization header is sent at all — mirroring the backend's
   * ai-provider.service.ts convention.
   */
  apiKey?: string;
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (endpoint.apiKey) {
    headers['Authorization'] = `Bearer ${endpoint.apiKey}`;
  }
  const response = await fetchImpl(chatCompletionsUrl(endpoint), {
    method: 'POST',
    headers,
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
 * Incremental reasoning-text filter (CODEX-REVIEW gate, PR #1119).
 *
 * Reasoning models served on the same endpoint (e.g. DeepSeek R1 distills)
 * prefix the answer with a `<think>…</think>` block — sometimes without the
 * opening tag. The non-streaming path strips it with `stripReasoning`; the
 * streaming path must never expose it either, chunk by chunk. This filter
 * suppresses everything between `<think>` and `</think>`, tolerates tags
 * split across chunk boundaries, and drops an unclosed block at EOF.
 */
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

interface ReasoningFilter {
  /** Feed a text segment; returns the publishable (non-reasoning) portion. */
  push(segment: string): string;
  /** End of stream: flush buffered publishable text (never reasoning). */
  flush(): string;
}

function createReasoningFilter(): ReasoningFilter {
  let buffer = '';
  let inThink = false;
  return {
    push(segment: string): string {
      buffer += segment;
      let out = '';
      for (;;) {
        if (inThink) {
          const close = buffer.indexOf(THINK_CLOSE);
          if (close === -1) {
            // Keep a tail long enough to catch a close tag split across chunks.
            buffer = buffer.slice(-(THINK_CLOSE.length - 1));
            break;
          }
          buffer = buffer.slice(close + THINK_CLOSE.length);
          inThink = false;
          continue;
        }
        const open = buffer.indexOf(THINK_OPEN);
        if (open === -1) {
          // Emit everything except a tail that could be the start of a
          // `<think>` tag split across chunks; plain `<` text flows through.
          const lt = buffer.lastIndexOf('<');
          const hold =
            lt !== -1 && THINK_OPEN.startsWith(buffer.slice(lt)) ? buffer.length - lt : 0;
          out += buffer.slice(0, buffer.length - hold);
          buffer = buffer.slice(buffer.length - hold);
          break;
        }
        out += buffer.slice(0, open);
        buffer = buffer.slice(open + THINK_OPEN.length);
        inThink = true;
      }
      return out;
    },
    flush(): string {
      // An unclosed reasoning block is never exposed.
      if (inThink) return '';
      // Drop a trailing partial open tag; anything else is user-visible text.
      const lt = buffer.lastIndexOf('<');
      if (lt !== -1 && THINK_OPEN.startsWith(buffer.slice(lt))) {
        return buffer.slice(0, lt);
      }
      return buffer;
    },
  };
}

/**
 * Streaming chat completion over Server-Sent Events. Yields text deltas as
 * they arrive and finishes on `data: [DONE]`.
 *
 * Fail-closed (CODEX-REVIEW gate, PR #1119):
 * - a stream that ends WITHOUT `data: [DONE]` was truncated mid-answer and
 *   throws instead of surfacing a partial answer as complete;
 * - a stream that completes with zero content throws instead of surfacing
 *   an empty answer;
 * - `<think>…</think>` reasoning blocks are filtered out of every chunk, so
 *   reasoning text is never exposed to callers.
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
  const reasoning = createReasoningFilter();
  let buffer = '';
  let sawDone = false;
  let yieldedAny = false;

  /** Process one SSE line. Returns the publishable text, or null. Sets sawDone. */
  const processLine = (rawLine: string): string | null => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      sawDone = true;
      return null;
    }
    let parsed: { choices?: Array<{ delta?: { content?: string | null } }> };
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null; // keep-alive comments and partial frames are not content
    }
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) {
      const publishable = reasoning.push(delta);
      if (publishable.length > 0) {
        yieldedAny = true;
        return publishable;
      }
    }
    return null;
  };

  try {
    let reading = true;
    while (reading) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const text = processLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (text !== null) yield text;
        if (sawDone) {
          reading = false;
          break;
        }
      }
    }
    // A final line may arrive without a trailing newline (e.g. `data: [DONE]`
    // as the last bytes before EOF) — process it before judging truncation.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const text = processLine(buffer);
      if (text !== null) yield text;
      buffer = '';
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawDone) {
    throw new Error(
      'OpenAI-compatible provider truncated the stream (EOF before data: [DONE]); ' +
        'refusing to surface a partial answer as complete',
    );
  }
  const tail = reasoning.flush();
  if (tail.length > 0) {
    yieldedAny = true;
    yield tail;
  }
  if (!yieldedAny) {
    throw new Error('OpenAI-compatible provider returned an empty completion');
  }
}
