import type { ModelCapabilities, ModelRegistryEntry } from './types.js';

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  chat: true,
  completion: true,
  embedding: false,
  imageGeneration: false,
  codeGeneration: false,
  functionCalling: false,
  maxContextLength: 4096,
  streaming: true,
};

const DEFAULT_MODELS: ModelRegistryEntry[] = [
  {
    id: 'openai-gpt-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'OpenAI GPT-4o',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 128000,
    },
    pricing: { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: false,
    maxContextLength: 128000,
    tags: ['flagship', 'multimodal', 'reasoning'],
  },
  {
    id: 'openai-gpt-4o-mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'OpenAI GPT-4o Mini',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 128000,
    },
    pricing: { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: false,
    maxContextLength: 128000,
    tags: ['fast', 'affordable', 'general'],
  },
  {
    id: 'anthropic-claude-3-5-sonnet',
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Anthropic Claude 3.5 Sonnet',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 200000,
    },
    pricing: { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: false,
    maxContextLength: 200000,
    tags: ['flagship', 'reasoning', 'code'],
  },
  {
    id: 'anthropic-claude-3-haiku',
    provider: 'anthropic',
    modelId: 'claude-3-haiku-20240307',
    displayName: 'Anthropic Claude 3 Haiku',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 200000,
    },
    pricing: { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: false,
    maxContextLength: 200000,
    tags: ['fast', 'affordable', 'general'],
  },
  {
    id: 'google-gemini-1-5-pro',
    provider: 'google',
    modelId: 'gemini-1.5-pro',
    displayName: 'Google Gemini 1.5 Pro',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 2000000,
    },
    pricing: { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: false,
    maxContextLength: 2000000,
    tags: ['long-context', 'multimodal', 'reasoning'],
  },
  {
    id: 'google-gemini-1-5-flash',
    provider: 'google',
    modelId: 'gemini-1.5-flash',
    displayName: 'Google Gemini 1.5 Flash',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 1000000,
    },
    pricing: { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: false,
    maxContextLength: 1000000,
    tags: ['fast', 'affordable', 'long-context'],
  },
  {
    id: 'groq-llama-3-1',
    provider: 'groq',
    modelId: 'llama-3.1-70b-versatile',
    displayName: 'Groq Llama 3.1 70B',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 131072,
    },
    pricing: { inputPer1kTokens: 0.00059, outputPer1kTokens: 0.00079, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: false,
    maxContextLength: 131072,
    tags: ['open-source', 'fast', 'groq-accelerated'],
  },
  {
    id: 'groq-mixtral',
    provider: 'groq',
    modelId: 'mixtral-8x7b-32768',
    displayName: 'Groq Mixtral 8x7B',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      maxContextLength: 32768,
    },
    pricing: { inputPer1kTokens: 0.00024, outputPer1kTokens: 0.00024, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: false,
    maxContextLength: 32768,
    tags: ['open-source', 'fast', 'moe'],
  },
  {
    id: 'local-phi-3',
    provider: 'local',
    modelId: 'phi-3-mini-4k',
    displayName: 'Microsoft Phi-3 Mini (Local)',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      codeGeneration: true,
      maxContextLength: 4096,
    },
    pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: true,
    maxContextLength: 4096,
    tags: ['local', 'small', 'efficient', 'code'],
  },
  {
    id: 'local-llama-3-2-3b',
    provider: 'local',
    modelId: 'llama-3.2-3b',
    displayName: 'Meta Llama 3.2 3B (Local)',
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      maxContextLength: 8192,
    },
    pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0, currency: 'USD' },
    latencyProfile: 'fast',
    localCompatible: true,
    maxContextLength: 8192,
    tags: ['local', 'small', 'general', 'meta'],
  },
];

export class ModelRegistry {
  private readonly models: Map<string, ModelRegistryEntry> = new Map();

  constructor() {
    for (const model of DEFAULT_MODELS) {
      this.models.set(model.id, model);
    }
  }

  listModels(filters?: {
    provider?: string;
    capability?: keyof ModelCapabilities;
    priceRange?: { max: number };
    local?: boolean;
  }): ModelRegistryEntry[] {
    let results = Array.from(this.models.values());

    if (filters?.provider) {
      results = results.filter((m) => m.provider === filters.provider);
    }
    if (filters?.capability) {
      const cap = filters.capability;
      results = results.filter((m) => {
        const val = m.capabilities[cap];
        return typeof val === 'boolean' ? val : (val as number) > 0;
      });
    }
    if (filters?.priceRange) {
      const maxPrice = filters.priceRange.max;
      results = results.filter((m) => m.pricing.inputPer1kTokens <= maxPrice);
    }
    if (filters?.local !== undefined) {
      results = results.filter((m) => m.localCompatible === filters.local);
    }

    return results;
  }

  getModel(modelId: string): ModelRegistryEntry | null {
    return this.models.get(modelId) ?? null;
  }

  getModelsByCapability(capability: keyof ModelCapabilities): ModelRegistryEntry[] {
    return Array.from(this.models.values()).filter((m) => {
      const val = m.capabilities[capability];
      return typeof val === 'boolean' ? val : (val as number) > 0;
    });
  }

  getModelPricing(modelId: string): ModelRegistryEntry['pricing'] | null {
    const model = this.models.get(modelId);
    return model ? { ...model.pricing } : null;
  }

  compareModels(modelIds: string[]): ModelRegistryEntry[] {
    const results: ModelRegistryEntry[] = [];
    for (const id of modelIds) {
      const model = this.models.get(id);
      if (model) results.push(model);
    }
    return results;
  }

  registerCustomModel(entry: ModelRegistryEntry): void {
    this.models.set(entry.id, entry);
  }
}
