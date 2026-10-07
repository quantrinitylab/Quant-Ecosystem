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
