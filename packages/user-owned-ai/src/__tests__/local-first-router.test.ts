import { describe, expect, it } from 'vitest';
import { LocalFirstRouter } from '../local-first-router.js';
import type { LocalAICapabilities, ModelRegistryEntry } from '../types.js';

describe('LocalFirstRouter', () => {
  const localModel: ModelRegistryEntry = {
    id: 'local-phi-3',
    provider: 'local',
    modelId: 'phi-3-mini-4k',
    displayName: 'Phi-3 Mini (Local)',
    capabilities: {
      chat: true,
      completion: true,
      embedding: false,
      imageGeneration: false,
      codeGeneration: true,
      functionCalling: false,
      maxContextLength: 4096,
      streaming: true,
    },
    pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: true,
    maxContextLength: 4096,
    tags: ['local'],
  };

  const cloudModel: ModelRegistryEntry = {
    id: 'openai-gpt-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    capabilities: {
      chat: true,
      completion: true,
      embedding: false,
      imageGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      maxContextLength: 128000,
      streaming: true,
    },
    pricing: { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015, currency: 'USD' },
    latencyProfile: 'balanced',
    localCompatible: false,
    maxContextLength: 128000,
    tags: ['flagship'],
  };

  const webgpuCapabilities: LocalAICapabilities = {
    webgpu: true,
    coreml: true,
    nnapi: false,
    wasmSimd: true,
    availableModels: ['phi-3-mini-4k'],
  };

  const weakCapabilities: LocalAICapabilities = {
    webgpu: false,
    coreml: false,
    nnapi: false,
    wasmSimd: true,
    availableModels: [],
  };

  it('detects capabilities from device info', () => {
    const router = new LocalFirstRouter();

    const caps = router.detectCapabilities({
      webgpu: true,
      coreml: false,
      nnapi: true,
      wasmSimd: true,
      availableModels: ['phi-3-mini-4k'],
    });

    expect(caps.webgpu).toBe(true);
    expect(caps.coreml).toBe(false);
    expect(caps.nnapi).toBe(true);
    expect(caps.wasmSimd).toBe(true);
    expect(caps.availableModels).toContain('phi-3-mini-4k');
  });

  it('routes to local when device supports WebGPU and model is available', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([localModel, cloudModel]);

    const decision = router.routeInference(
      { modelId: 'local-phi-3', tokensEstimate: 500 },
      webgpuCapabilities,
    );

    expect(decision.target).toBe('local');
    expect(decision.estimatedCost).toBe(0);
    expect(decision.estimatedLatency).toBeGreaterThan(0);
  });

  it('falls back to cloud when no local support', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([localModel, cloudModel]);

    const decision = router.routeInference(
      { modelId: 'openai-gpt-4o', tokensEstimate: 1000 },
      weakCapabilities,
    );

    expect(decision.target).toBe('cloud');
    expect(decision.estimatedCost).toBeGreaterThan(0);
  });

  it('falls back to cloud when capability score is below threshold', () => {
    const router = new LocalFirstRouter({ minCapabilityScore: 0.5 });
    router.setRegistry([localModel]);

    const decision = router.routeInference(
      { modelId: 'local-phi-3', tokensEstimate: 500 },
      weakCapabilities,
    );

    expect(decision.target).toBe('cloud');
    expect(decision.reason).toContain('capability score');
  });

  it('estimates cost and latency for cloud routing', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([cloudModel]);

    const decision = router.routeInference(
      { modelId: 'openai-gpt-4o', tokensEstimate: 1000 },
      weakCapabilities,
    );

    expect(decision.target).toBe('cloud');
    expect(decision.estimatedCost).toBeCloseTo(0.005, 3);
    expect(decision.estimatedLatency).toBeGreaterThan(0);
  });

  it('returns compatible local models based on capabilities', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([localModel, cloudModel]);

    const localModels = router.getLocalModels(webgpuCapabilities);

    expect(localModels).toHaveLength(1);
    expect(localModels[0]!.id).toBe('local-phi-3');
  });

  it('returns empty array when no local models are compatible', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([cloudModel]);

    const localModels = router.getLocalModels(weakCapabilities);

    expect(localModels).toHaveLength(0);
  });

  it('shouldRouteLocal returns false when preferLocal is disabled', () => {
    const router = new LocalFirstRouter({ preferLocal: false });
    router.setRegistry([localModel]);

    const should = router.shouldRouteLocal(
      { modelId: 'local-phi-3', tokensEstimate: 500 },
      webgpuCapabilities,
    );

    expect(should).toBe(false);
  });

  it('shouldRouteLocal returns false when model is not local compatible', () => {
    const router = new LocalFirstRouter();
    router.setRegistry([cloudModel]);

    const should = router.shouldRouteLocal(
      { modelId: 'openai-gpt-4o', tokensEstimate: 500 },
      webgpuCapabilities,
    );

    expect(should).toBe(false);
  });
});
