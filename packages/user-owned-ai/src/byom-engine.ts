import type {
  BYOMConfig,
  ModelEndpoint,
  ModelProvider,
  InferenceRequest,
  InferenceOptions,
  InferenceResult,
  ModelCapabilities,
  CostSummary,
  EndpointCost,
} from './types.js';

export class BYOMEngine {
  private config: BYOMConfig;
  private providers: Map<string, ModelProvider>;
  private endpoints: Map<string, ModelEndpoint>;
  private requests: InferenceRequest[];
  private costHistory: Map<string, number>;

  constructor(config: Partial<BYOMConfig> & { userId: string }) {
    this.config = {
      userId: config.userId,
      defaultProvider: config.defaultProvider ?? null,
      endpoints: config.endpoints ?? [],
      costTracking: config.costTracking ?? true,
      maxMonthlyBudget: config.maxMonthlyBudget ?? null,
      localInferenceEnabled: config.localInferenceEnabled ?? false,
    };
    this.providers = new Map();
    this.endpoints = new Map();
    this.requests = [];
    this.costHistory = new Map();

    for (const endpoint of this.config.endpoints) {
      this.endpoints.set(endpoint.id, endpoint);
    }
  }

  getConfig(): BYOMConfig {
    return { ...this.config };
  }

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.config.defaultProvider) {
      this.config.defaultProvider = provider.id;
    }
  }

  getProvider(providerId: string): ModelProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  removeProvider(providerId: string): boolean {
    if (this.config.defaultProvider === providerId) {
      this.config.defaultProvider = null;
    }
    return this.providers.delete(providerId);
  }

  addEndpoint(endpoint: ModelEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
    this.config.endpoints = Array.from(this.endpoints.values());
  }

  getEndpoint(endpointId: string): ModelEndpoint | null {
    return this.endpoints.get(endpointId) ?? null;
  }

  getEndpoints(): ModelEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  getActiveEndpoints(): ModelEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter((e) => e.active)
      .sort((a, b) => a.priority - b.priority);
  }

  removeEndpoint(endpointId: string): boolean {
    return this.endpoints.delete(endpointId);
  }

  detectCapabilities(endpoint: ModelEndpoint): ModelCapabilities {
    return { ...endpoint.capabilities };
  }

  async infer(
    endpointId: string,
    prompt: string,
    options?: Partial<InferenceOptions>,
  ): Promise<InferenceResult> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);
    if (!endpoint.active) throw new Error(`Endpoint ${endpointId} is not active`);

    const fullOptions: InferenceOptions = {
      maxTokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
      topP: options?.topP ?? 1.0,
      stopSequences: options?.stopSequences,
      stream: options?.stream ?? false,
    };

    const request: InferenceRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endpointId,
      prompt,
      options: fullOptions,
      timestamp: new Date(),
      status: 'running',
    };

    this.requests.push(request);

    const tokensUsed = Math.ceil(prompt.length / 4) + fullOptions.maxTokens;
    const cost =
      (prompt.length / 4) * endpoint.costPerToken.input +
      fullOptions.maxTokens * endpoint.costPerToken.output;

    const result: InferenceResult = {
      text: `[Inference result for: ${prompt.slice(0, 50)}]`,
      tokensUsed,
      latencyMs: 100,
      cost,
      model: endpoint.modelId,
    };

    request.status = 'completed';
    request.result = result;

    this.trackCost(endpointId, cost);

    return result;
  }

  getBudgetRemaining(): number | null {
    if (!this.config.maxMonthlyBudget) return null;
    const spent = this.getMonthlySpend();
    return Math.max(0, this.config.maxMonthlyBudget - spent);
  }

  isWithinBudget(): boolean {
    if (!this.config.maxMonthlyBudget) return true;
    return this.getMonthlySpend() < this.config.maxMonthlyBudget;
  }

  getMonthlySpend(): number {
    let total = 0;
    for (const cost of this.costHistory.values()) {
      total += cost;
    }
    return total;
  }

  getCostSummary(): CostSummary {
    const byEndpoint = new Map<string, EndpointCost>();

    for (const request of this.requests) {
      if (request.result) {
        const existing = byEndpoint.get(request.endpointId) ?? {
          endpointId: request.endpointId,
          cost: 0,
          tokens: 0,
          requests: 0,
        };
        existing.cost += request.result.cost;
        existing.tokens += request.result.tokensUsed;
        existing.requests++;
        byEndpoint.set(request.endpointId, existing);
      }
    }

    return {
      userId: this.config.userId,
      period: 'monthly',
      totalCost: this.getMonthlySpend(),
      totalTokens: this.requests.reduce((sum, r) => sum + (r.result?.tokensUsed ?? 0), 0),
      requestCount: this.requests.filter((r) => r.status === 'completed').length,
      byEndpoint,
      currency: 'USD',
    };
  }

  getRequestHistory(): InferenceRequest[] {
    return [...this.requests];
  }

  isLocalInferenceEnabled(): boolean {
    return this.config.localInferenceEnabled;
  }

  enableLocalInference(): void {
    this.config.localInferenceEnabled = true;
  }

  disableLocalInference(): void {
    this.config.localInferenceEnabled = false;
  }

  private trackCost(endpointId: string, cost: number): void {
    const current = this.costHistory.get(endpointId) ?? 0;
    this.costHistory.set(endpointId, current + cost);
  }
}

export function createBYOMEngine(config: Partial<BYOMConfig> & { userId: string }): BYOMEngine {
  return new BYOMEngine(config);
}
