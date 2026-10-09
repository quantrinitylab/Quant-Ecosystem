// ============================================================================
// QuantAI - Model Definitions
// Available AI models, providers, and capability metadata
// ============================================================================

export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'meta' | 'google' | 'quant';
  contextWindow: number;
  capabilities: string[];
  icon: string;
  description: string;
  isDefault?: boolean;
  /**
   * True when the model is only usable with the user's own provider API key
   * (BYOM). Platform-served models do not set this.
   */
  requiresUserKey?: boolean;
}

// Platform-served models only. Third-party provider models (OpenAI, Anthropic,
// Meta, Google) were listed here as bring-your-own-key options, but there is
// no provider-key entry UI and the backend cannot serve them — listing them
// implied Quant serves models it does not. They are intentionally NOT in this
// list. (The BYOM model registry still exists server-side for a future
// key-entry flow; it is filtered out of the picker in useModels.)
export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'quant-1',
    name: 'Quant-1',
    provider: 'quant',
    contextWindow: 256000,
    capabilities: ['ecosystem', 'automation', 'tools', 'cross-app'],
    icon: '🚀',
    description: 'Native Quant ecosystem model',
    isDefault: true,
  },
];

export type ProviderId = AIModel['provider'];

export const PROVIDER_COLORS: Record<ProviderId, string> = {
  openai: '#10A37F',
  anthropic: '#D4A574',
  meta: '#0668E1',
  google: '#4285F4',
  quant: '#6366F1',
};
