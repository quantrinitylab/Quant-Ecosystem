// ============================================================================
// QuantMail — pluggable AI provider layer.
//
// Every AI feature in QuantMail (Ask QuantAI copilot, composer assist, future
// features) calls `aiChat()` from here instead of talking to a vendor directly.
// Swapping the brain — Cloudflare Workers AI today, an OpenAI-compatible
// endpoint tomorrow, our own Quantrinity model later — is a config change only:
//
//   AI_PROVIDER=cloudflare            (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)
//   AI_PROVIDER=openai                (AI_API_KEY|OPENAI_API_KEY, AI_BASE_URL, AI_MODEL)
//   AI_PROVIDER=anthropic             (AI_API_KEY|ANTHROPIC_API_KEY, AI_MODEL)
//   AI_PROVIDER=custom                (AI_BASE_URL — OpenAI-compatible /chat/completions)
//
// `openai` and `custom` cover any OpenAI-compatible gateway (vLLM, Ollama,
// Bedrock proxies, our own inference service), so no application code has to
// change when the model changes.
// ============================================================================

export type AIRole = 'system' | 'user' | 'assistant';
export interface AIMessage {
  role: AIRole;
  content: string;
}
export interface AIChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /**
   * Override the model for this one call. Added so the reasoning tiers in
   * `@quant/common`'s `ai-intent` can run on different models when a deployment
   * sets `AI_MODEL_FAST` / `AI_MODEL_BALANCED` / `AI_MODEL_DEEP`; unset, every
   * tier keeps using the provider default and differs only by budget and prompt.
   *
   * MUST come from `process.env`, never from a request body: the Cloudflare REST
   * fallback interpolates the model into a URL path, so a client-supplied value
   * here would be a request-forgery sink. `resolveTierModel()` below is the only
   * intended source.
   */
  model?: string;
}

/**
 * Native function-calling tool definition, in the OpenAI `tools` wire format.
 * `parameters` is a JSON Schema object (`{ type: 'object', properties: {...},
 * required: [...] }`). Anthropic callers are translated to its `input_schema`
 * shape by the transport below.
 */
export interface AIToolFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** One tool call the model requested through native function calling. */
export interface AIToolCall {
  /** Provider-issued call id (may be empty on providers that omit it). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of a chat completion that may carry native tool calls. */
export interface AIChatWithToolsResult {
  /** Assistant text content (may be empty when the turn is pure tool calls). */
  content: string;
  /** Tool calls the model requested, in order. Never text-parsed. */
  toolCalls: AIToolCall[];
}

export interface AIChatWithToolsOptions extends AIChatOptions {
  /** Tool definitions exposed to the model via the provider's native `tools` parameter. */
  tools?: AIToolFunction[];
  /** 'auto' (default) lets the model decide; 'none' forbids tool use. */
  toolChoice?: 'auto' | 'none';
}

export type AIProviderName = 'cloudflare' | 'openai' | 'anthropic' | 'custom' | 'none';

const DEFAULT_TIMEOUT_MS = 40_000;
const CLOUDFLARE_DEFAULT_ACCOUNT_ID = '9af698848a5edd00e756c3a2c908ec8d';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function getCloudflareToken(): string | undefined {
  return env('CLOUDFLARE_API_TOKEN') ?? env('CLOUDFLARE_API_KEY');
}

function getCloudflareAccountId(): string {
  return env('CLOUDFLARE_ACCOUNT_ID') ?? CLOUDFLARE_DEFAULT_ACCOUNT_ID;
}

/** Which provider is configured right now (env is read per call, never cached). */
export function activeProvider(): AIProviderName {
  const configured = env('AI_PROVIDER')?.toLowerCase();

  if (configured === 'cloudflare') {
    return getCloudflareToken() ? 'cloudflare' : 'none';
  }
  if (configured === 'anthropic') {
    return (env('AI_API_KEY') ?? env('ANTHROPIC_API_KEY')) ? 'anthropic' : 'none';
  }
  if (configured === 'openai') {
    return (env('AI_API_KEY') ?? env('OPENAI_API_KEY')) ? 'openai' : 'none';
  }
  if (configured === 'custom') {
    return env('AI_BASE_URL') ? 'custom' : 'none';
  }

  // No explicit provider: auto-detect whatever credentials exist (prioritize Cloudflare Workers AI).
  if (getCloudflareToken()) return 'cloudflare';
  if (env('OPENAI_API_KEY') ?? env('AI_API_KEY')) return 'openai';
  if (env('ANTHROPIC_API_KEY')) return 'anthropic';
  if (env('AI_BASE_URL')) return 'custom';
  return 'none';
}

export function isAIConfigured(): boolean {
  return activeProvider() !== 'none';
}

/**
 * Read the model a reasoning tier is pinned to, if a deployment pinned one.
 * Takes the env var *name* from an `AIIntentPlan` (a closed union of three
 * literals), so nothing a client sends can select an arbitrary env var, and the
 * value can only ever come from this environment's own configuration.
 */
export function resolveTierModel(modelEnvVar: string): string | undefined {
  if (
    modelEnvVar !== 'AI_MODEL_FAST' &&
    modelEnvVar !== 'AI_MODEL_BALANCED' &&
    modelEnvVar !== 'AI_MODEL_DEEP'
  ) {
    return undefined;
  }
  return env(modelEnvVar);
}

export function aiUnavailableReason(): string {
  return 'QuantAI is not configured on this environment';
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`AI provider returned ${response.status}: ${text.slice(0, 400)}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function chatViaCloudflare(messages: AIMessage[], options: AIChatOptions): Promise<string> {
  const accountId = getCloudflareAccountId();
  const apiToken = getCloudflareToken()!;
  const model =
    options.model ??
    env('CLOUDFLARE_AI_MODEL') ??
    env('AI_MODEL') ??
    '@cf/meta/llama-3.1-70b-instruct';
  const baseUrl = env('CLOUDFLARE_AI_BASE_URL') ?? 'https://api.cloudflare.com/client/v4/accounts';

  // Primary: OpenAI-compatible /ai/v1/chat/completions endpoint
  try {
    const data = (await postJson(
      `${baseUrl}/${accountId}/ai/v1/chat/completions`,
      { Authorization: `Bearer ${apiToken}` },
      {
        model,
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.6,
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as { choices?: Array<{ message?: { content?: string } }> };

    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) return text;
  } catch (v1Err) {
    // Fallback: direct REST /ai/run endpoint
    const data = (await postJson(
      `${baseUrl}/${accountId}/ai/run/${model}`,
      { Authorization: `Bearer ${apiToken}` },
      {
        messages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.6,
      },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )) as { success?: boolean; result?: { response?: string } };

    const text = data.result?.response?.trim();
    if (!data.success || !text) throw v1Err;
    return text;
  }

  throw new Error('Workers AI returned an empty response');
}

async function chatViaOpenAICompatible(
  messages: AIMessage[],
  options: AIChatOptions,
): Promise<string> {
  const apiKey = env('AI_API_KEY') ?? env('OPENAI_API_KEY');
  const baseUrl = (env('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = options.model ?? env('AI_MODEL') ?? 'gpt-4o-mini';

  const data = (await postJson(
    `${baseUrl}/chat/completions`,
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    {
      model,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 1024,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )) as { choices?: Array<{ message?: { content?: string } }> };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI provider returned an empty response');
  return text;
}

async function chatViaAnthropic(messages: AIMessage[], options: AIChatOptions): Promise<string> {
  const apiKey = (env('AI_API_KEY') ?? env('ANTHROPIC_API_KEY'))!;
  const baseUrl = (env('AI_BASE_URL') ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const model = options.model ?? env('AI_MODEL') ?? 'claude-3-5-haiku-latest';

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const data = (await postJson(
    `${baseUrl}/messages`,
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      system: system || undefined,
      messages: turns,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.6,
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )) as { content?: Array<{ text?: string }> };

  const text = data.content
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('AI provider returned an empty response');
  return text;
}

/**
 * Run a chat completion through whichever provider is configured.
 * Throws when no provider is configured or the provider fails; callers map
 * that to a clean 503 so the UI can show an offline/retry state.
 */
export async function aiChat(messages: AIMessage[], options: AIChatOptions = {}): Promise<string> {
  const provider = activeProvider();
  switch (provider) {
    case 'cloudflare':
      return chatViaCloudflare(messages, options);
    case 'openai':
    case 'custom':
      return chatViaOpenAICompatible(messages, options);
    case 'anthropic':
      return chatViaAnthropic(messages, options);
    default:
      throw new Error(aiUnavailableReason());
  }
}

// ---------------------------------------------------------------------------
// Native function calling.
//
// The old QuantAI tool path had the model emit ```tool_call fenced JSON
// blocks inside its prose and had the route regex-scan them back out — a
// fragile hack around what the providers already expose natively. These
// transports pass the tool definitions through the provider's own `tools`
// parameter and read the structured `tool_calls` back off the response, so
// no text parsing is involved. A tool call whose arguments do not parse as
// a JSON object is dropped, never executed.
// ---------------------------------------------------------------------------

interface OpenAIToolCallWire {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

function parseOpenAIToolCalls(message: {
  content?: string | null;
  tool_calls?: OpenAIToolCallWire[];
}): AIChatWithToolsResult {
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  const toolCalls: AIToolCall[] = [];
  for (const tc of message?.tool_calls ?? []) {
    // Only function-type calls with a name are actionable.
    if (tc?.type !== 'function' || !tc.function?.name) continue;
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(tc.function.arguments ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      args = parsed as Record<string, unknown>;
    } catch {
      // Malformed arguments: drop the call rather than executing garbage.
      continue;
    }
    toolCalls.push({ id: String(tc.id ?? ''), name: tc.function.name, arguments: args });
  }
  return { content, toolCalls };
}

async function chatWithToolsViaOpenAICompatible(
  messages: AIMessage[],
  options: AIChatWithToolsOptions,
  overrides: { baseUrl: string; headers: Record<string, string>; model: string },
): Promise<AIChatWithToolsResult> {
  const data = (await postJson(
    `${overrides.baseUrl}/chat/completions`,
    overrides.headers,
    {
      model: overrides.model,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 1024,
      tools: options.tools ?? [],
      tool_choice: options.toolChoice === 'none' ? 'none' : 'auto',
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAIToolCallWire[] } }> };

  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('AI provider returned an empty response');
  return parseOpenAIToolCalls(message);
}

async function chatWithToolsViaCloudflare(
  messages: AIMessage[],
  options: AIChatWithToolsOptions,
): Promise<AIChatWithToolsResult> {
  const accountId = getCloudflareAccountId();
  const apiToken = getCloudflareToken()!;
  const model =
    options.model ??
    env('CLOUDFLARE_AI_MODEL') ??
    env('AI_MODEL') ??
    '@cf/meta/llama-3.1-70b-instruct';
  const baseUrl = env('CLOUDFLARE_AI_BASE_URL') ?? 'https://api.cloudflare.com/client/v4/accounts';

  // Cloudflare's OpenAI-compatible endpoint supports native `tools`. The
  // legacy /ai/run REST fallback does not — when tools are requested we must
  // NOT silently fall back to a text-only call, or tool calls would vanish.
  return chatWithToolsViaOpenAICompatible(messages, options, {
    baseUrl: `${baseUrl}/${accountId}/ai/v1`,
    headers: { Authorization: `Bearer ${apiToken}` },
    model,
  });
}

async function chatWithToolsViaAnthropic(
  messages: AIMessage[],
  options: AIChatWithToolsOptions,
): Promise<AIChatWithToolsResult> {
  const apiKey = (env('AI_API_KEY') ?? env('ANTHROPIC_API_KEY'))!;
  const baseUrl = (env('AI_BASE_URL') ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
  const model = options.model ?? env('AI_MODEL') ?? 'claude-3-5-haiku-latest';

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const data = (await postJson(
    `${baseUrl}/messages`,
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    {
      model,
      system: system || undefined,
      messages: turns,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.6,
      tools: (options.tools ?? []).map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )) as {
    content?: Array<{ type?: string; text?: string; id?: string; name?: string; input?: unknown }>;
  };

  const textParts: string[] = [];
  const toolCalls: AIToolCall[] = [];
  for (const part of data.content ?? []) {
    if (part?.type === 'text') {
      textParts.push(part.text ?? '');
    } else if (part?.type === 'tool_use' && part.name) {
      const input = part.input;
      toolCalls.push({
        id: String(part.id ?? ''),
        name: part.name,
        arguments:
          input && typeof input === 'object' && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {},
      });
    }
  }
  return { content: textParts.join('').trim(), toolCalls };
}

/**
 * Run a chat completion with native function calling through whichever
 * provider is configured. Tool definitions ride the provider's `tools`
 * parameter; requested calls come back structured on the response — the
 * caller never parses model prose for tool calls.
 */
export async function aiChatWithTools(
  messages: AIMessage[],
  options: AIChatWithToolsOptions = {},
): Promise<AIChatWithToolsResult> {
  const provider = activeProvider();
  switch (provider) {
    case 'cloudflare':
      return chatWithToolsViaCloudflare(messages, options);
    case 'openai':
    case 'custom':
      return chatWithToolsViaOpenAICompatible(messages, options, {
        baseUrl: (env('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        headers: ((): Record<string, string> => {
          const apiKey = env('AI_API_KEY') ?? env('OPENAI_API_KEY');
          return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        })(),
        model: options.model ?? env('AI_MODEL') ?? 'gpt-4o-mini',
      });
    case 'anthropic':
      return chatWithToolsViaAnthropic(messages, options);
    default:
      throw new Error(aiUnavailableReason());
  }
}
