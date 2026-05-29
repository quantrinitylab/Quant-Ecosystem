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
}

export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    capabilities: ['reasoning', 'vision', 'code', 'tools'],
    icon: '⭐',
    description: 'Most capable OpenAI model',
    isDefault: true,
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    contextWindow: 128000,
    capabilities: ['reasoning', 'code', 'tools'],
    icon: '⚡',
    description: 'Powerful reasoning model',
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    capabilities: ['reasoning', 'code', 'vision', 'tools', 'analysis'],
    icon: '✨',
    description: 'Best for nuanced tasks',
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    capabilities: ['reasoning', 'creative', 'analysis'],
    icon: '🎵',
    description: 'Creative & analytical powerhouse',
  },
  {
    id: 'llama-3-70b',
    name: 'Llama 3 70B',
    provider: 'meta',
    contextWindow: 8192,
    capabilities: ['reasoning', 'code', 'multilingual'],
    icon: '🦙',
    description: 'Open-source excellence',
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'google',
    contextWindow: 1000000,
    capabilities: ['reasoning', 'vision', 'code', 'multimodal'],
    icon: '💎',
    description: 'Google multimodal AI',
  },
  {
    id: 'quant-1',
    name: 'Quant-1',
    provider: 'quant',
    contextWindow: 256000,
    capabilities: ['ecosystem', 'automation', 'tools', 'cross-app'],
    icon: '🚀',
    description: 'Native Quant ecosystem model',
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
