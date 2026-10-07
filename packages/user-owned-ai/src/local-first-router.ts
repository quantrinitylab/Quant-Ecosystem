import type { LocalAICapabilities, LocalFirstConfig, ModelRegistryEntry } from './types.js';

export interface RoutingDecision {
  target: 'local' | 'cloud';
  reason: string;
  estimatedLatency: number;
  estimatedCost: number;
}

export interface InferenceRoutingRequest {
  modelId: string;
  tokensEstimate: number;
  requiresStreaming?: boolean;
  maxLatencyMs?: number;
}

const DEFAULT_CONFIG: LocalFirstConfig = {
  preferLocal: true,
  fallbackToCloud: true,
  minCapabilityScore: 0.5,
};

export class LocalFirstRouter {
  private readonly config: LocalFirstConfig;
  private registry: ModelRegistryEntry[] = [];

  constructor(config: Partial<LocalFirstConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setRegistry(models: ModelRegistryEntry[]): void {
    this.registry = models;
  }

  detectCapabilities(deviceInfo: {
    webgpu?: boolean;
    coreml?: boolean;
    nnapi?: boolean;
    wasmSimd?: boolean;
    availableModels?: string[];
  }): LocalAICapabilities {
    return {
      webgpu: deviceInfo.webgpu ?? false,
      coreml: deviceInfo.coreml ?? false,
      nnapi: deviceInfo.nnapi ?? false,
      wasmSimd: deviceInfo.wasmSimd ?? false,
      availableModels: deviceInfo.availableModels ?? [],
    };
  }

  shouldRouteLocal(request: InferenceRoutingRequest, capabilities: LocalAICapabilities): boolean {
    if (!this.config.preferLocal) return false;

    const score = this.computeCapabilityScore(capabilities);
    if (score < this.config.minCapabilityScore) return false;

    const model = this.registry.find(
      (m) => m.id === request.modelId || m.modelId === request.modelId,
    );
    if (!model) return false;
    if (!model.localCompatible) return false;

    if (!capabilities.availableModels.includes(model.modelId)) return false;

    return true;
  }

  routeInference(
    request: InferenceRoutingRequest,
    capabilities: LocalAICapabilities,
  ): RoutingDecision {
    const shouldLocal = this.shouldRouteLocal(request, capabilities);

    if (shouldLocal) {
      return {
        target: 'local',
        reason: 'Device meets capability threshold and model is locally available',
        estimatedLatency: this.estimateLocalLatency(request.tokensEstimate),
        estimatedCost: 0,
      };
    }

    if (!this.config.fallbackToCloud && this.config.preferLocal) {
      return {
        target: 'local',
        reason: 'Cloud fallback disabled, attempting local despite low capability',
        estimatedLatency: this.estimateLocalLatency(request.tokensEstimate) * 3,
        estimatedCost: 0,
      };
    }

    const model = this.registry.find(
      (m) => m.id === request.modelId || m.modelId === request.modelId,
    );
    const cloudCost = model
      ? (request.tokensEstimate / 1000) * model.pricing.inputPer1kTokens
      : 0.01;

    return {
      target: 'cloud',
      reason: this.getCloudReason(request, capabilities),
      estimatedLatency: this.estimateCloudLatency(request.tokensEstimate),
      estimatedCost: cloudCost,
    };
  }

  getLocalModels(capabilities: LocalAICapabilities): ModelRegistryEntry[] {
    return this.registry.filter(
      (m) => m.localCompatible && capabilities.availableModels.includes(m.modelId),
    );
  }

  private computeCapabilityScore(capabilities: LocalAICapabilities): number {
    let score = 0;
    if (capabilities.webgpu) score += 0.4;
    if (capabilities.coreml) score += 0.3;
    if (capabilities.nnapi) score += 0.2;
    if (capabilities.wasmSimd) score += 0.1;
    return score;
  }

  private estimateLocalLatency(tokens: number): number {
    return 50 + tokens * 0.5;
  }

  private estimateCloudLatency(tokens: number): number {
    return 200 + tokens * 0.1;
  }

  private getCloudReason(
    request: InferenceRoutingRequest,
    capabilities: LocalAICapabilities,
  ): string {
    const score = this.computeCapabilityScore(capabilities);
    if (score < this.config.minCapabilityScore) {
      return `Device capability score (${score.toFixed(2)}) below threshold (${this.config.minCapabilityScore})`;
    }

    const model = this.registry.find(
      (m) => m.id === request.modelId || m.modelId === request.modelId,
    );
    if (!model) return 'Model not found in registry';
    if (!model.localCompatible) return 'Model not compatible with local inference';
    if (!capabilities.availableModels.includes(model.modelId)) {
      return 'Model not available on device';
    }

    return 'Routed to cloud for optimal performance';
  }
}
