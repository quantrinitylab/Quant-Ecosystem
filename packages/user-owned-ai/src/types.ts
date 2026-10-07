export interface BYOMConfig {
  userId: string;
  defaultProvider: string | null;
  endpoints: ModelEndpoint[];
  costTracking: boolean;
  maxMonthlyBudget: number | null;
  localInferenceEnabled: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic-compatible' | 'huggingface' | 'ollama' | 'custom';
  baseUrl: string;
  apiKey?: string;
  capabilities: ModelCapabilities;
  rateLimit: RateLimit;
}

export interface ModelEndpoint {
  id: string;
  providerId: string;
  modelId: string;
  url: string;
  apiKey?: string;
  active: boolean;
  priority: number;
  capabilities: ModelCapabilities;
  costPerToken: CostPerToken;
}

export interface InferenceRequest {
  id: string;
  endpointId: string;
  prompt: string;
  options: InferenceOptions;
  timestamp: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: InferenceResult;
}

export interface InferenceOptions {
  maxTokens: number;
  temperature: number;
  topP: number;
  stopSequences?: string[];
  stream: boolean;
}

export interface InferenceResult {
  text: string;
  tokensUsed: number;
  latencyMs: number;
  cost: number;
  model: string;
}

export interface ModelCapabilities {
  chat: boolean;
  completion: boolean;
  embedding: boolean;
  imageGeneration: boolean;
  codeGeneration: boolean;
  functionCalling: boolean;
  maxContextLength: number;
  streaming: boolean;
}

export interface CostPerToken {
  input: number;
  output: number;
  currency: string;
}

export interface RateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export interface CostSummary {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  byEndpoint: Map<string, EndpointCost>;
  currency: string;
}

export interface EndpointCost {
  endpointId: string;
  cost: number;
  tokens: number;
  requests: number;
}

// --- Phase 73: BYOC + Quant Credits Economy ---

export interface EncryptedKeyEntry {
  id: string;
  userId: string;
  provider: string;
  encryptedKey: string;
  iv: string;
  algorithm: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface KeyVaultConfig {
  encryptionAlgorithm: string;
  keyDerivationSalt: string;
}

export interface DailyAllowanceConfig {
  freeCreditsPerDay: number;
  planAllowances: Map<string, number>;
  resetHourUTC: number;
}

export interface DailyAllowanceState {
  userId: string;
  plan: string;
  creditsRemaining: number;
  lastResetAt: number;
  totalUsedToday: number;
}

export interface LocalAICapabilities {
  webgpu: boolean;
  coreml: boolean;
  nnapi: boolean;
  wasmSimd: boolean;
  availableModels: string[];
}

export interface LocalFirstConfig {
  preferLocal: boolean;
  fallbackToCloud: boolean;
  minCapabilityScore: number;
}

export interface ModelRegistryEntry {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
  pricing: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    currency: string;
  };
  latencyProfile: 'fast' | 'balanced' | 'quality';
  localCompatible: boolean;
  maxContextLength: number;
  tags: string[];
}

export interface SpendRecord {
  id: string;
  userId: string;
  modelId: string;
  appId: string;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  creditsUsed: number;
  timestamp: number;
  source: 'byoc' | 'credits' | 'allowance' | 'local';
}

export interface SpendDashboard {
  userId: string;
  periodStart: number;
  periodEnd: number;
  totalCost: number;
  totalCreditsUsed: number;
  totalTokens: number;
  byModel: Map<string, number>;
  byApp: Map<string, number>;
  byDay: Map<string, number>;
  savingsFromLocal: number;
}

export interface CreatorEarningEvent {
  creatorId: string;
  userId: string;
  modelUsage: string;
  appId: string;
  earningAmount: number;
  platformFee: number;
  timestamp: number;
}
