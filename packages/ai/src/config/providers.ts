// ============================================================================
// AI Config - Provider Configuration and Fallback Chain
// ============================================================================

export interface ProviderConfig {
  id: string;
  name: string;
  apiKeyEnvVar: string;
  baseUrl?: string;
  models: string[];
  isAvailable: () => boolean;
  costMultiplier: number;
}

export interface FallbackChainConfig {
  primary: string;
  secondary: string;
  tertiary?: string;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    // Meta is the ecosystem's primary provider (Muse Spark models, multimodal,
    // voice, agentic). Listed first so availability checks and the fallback
    // chain prefer it. Matches AIEngine routing (engine.ts), which reads
    // META_API_KEY (falling back to META_AI_API_KEY) and serves
    // https://api.meta.ai/v1.
    id: 'meta',
    name: 'Meta',
    apiKeyEnvVar: 'META_API_KEY',
    baseUrl: 'https://api.meta.ai/v1',
    models: ['muse-spark-1.3', 'muse-spark-1.3-voice'],
    isAvailable: () => Boolean(process.env['META_API_KEY'] ?? process.env['META_AI_API_KEY']),
    costMultiplier: 0.5,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    isAvailable: () => Boolean(process.env['OPENAI_API_KEY']),
    costMultiplier: 1.0,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    isAvailable: () => Boolean(process.env['ANTHROPIC_API_KEY']),
    costMultiplier: 1.1,
  },
  {
    id: 'google',
    name: 'Google',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    isAvailable: () => Boolean(process.env['GOOGLE_API_KEY']),
    costMultiplier: 0.8,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    models: [
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.1-70b-instruct',
      'deepseek/deepseek-chat',
    ],
    isAvailable: () => Boolean(process.env['OPENROUTER_API_KEY']),
    costMultiplier: 1.0,
  },
];

/**
 * Get the configuration for a specific provider by ID
 */
export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return PROVIDER_CONFIGS.find((p) => p.id === providerId);
}

/**
 * Get all providers that currently have their API keys configured
 */
export function getAvailableProviders(): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter((p) => p.isAvailable());
}

/**
 * Get the fallback chain based on which providers are available.
 * Returns providers in priority order: Meta > OpenAI > Anthropic > Google.
 * Returns null if no providers are available.
 */
export function getFallbackChain(): FallbackChainConfig | null {
  const available = getAvailableProviders();
  if (available.length === 0) return null;

  const chain: FallbackChainConfig = {
    primary: available[0]!.id,
    secondary: available.length > 1 ? available[1]!.id : available[0]!.id,
  };

  if (available.length > 2) {
    chain.tertiary = available[2]!.id;
  }

  return chain;
}

/**
 * Check if any AI provider is available (has API key set)
 */
export function hasAnyProvider(): boolean {
  return PROVIDER_CONFIGS.some((p) => p.isAvailable());
}
