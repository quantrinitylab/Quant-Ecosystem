import { describe, expect, it } from 'vitest';
import { EncryptedKeyVault } from '../encrypted-key-vault.js';
import { ModelRegistry } from '../model-registry.js';
import { DailyAllowanceService } from '../daily-allowance.service.js';
import { createBYOMEngine } from '../byom-engine.js';
import { SpendDashboardService } from '../spend-dashboard.service.js';
import { CreatorEarningService } from '../creator-earning.service.js';
import { LocalFirstRouter } from '../local-first-router.js';
import type { SpendRecord } from '../types.js';

describe('E2E BYOC Flow', () => {
  it('completes the full flow from key storage through dashboard update', async () => {
    // Step 1: Create EncryptedKeyVault and store an OpenAI key
    const vault = new EncryptedKeyVault();
    const originalKey = 'sk-proj-test-e2e-openai-key-12345';
    const entry = vault.storeKey('user-e2e', 'openai', originalKey);

    expect(entry.encryptedKey).not.toBe(originalKey);
    const decryptedKey = vault.retrieveKey('user-e2e', 'openai');
    expect(decryptedKey).toBe(originalKey);

    // Step 2: Use ModelRegistry to pick a model
    const registry = new ModelRegistry();
    const model = registry.getModel('openai-gpt-4o');
    expect(model).not.toBeNull();
    expect(model!.provider).toBe('openai');

    // Step 3: Check DailyAllowanceService has credits
    const allowanceService = new DailyAllowanceService();
    const allowance = allowanceService.getAllowance('user-e2e', 'pro');
    expect(allowance.creditsRemaining).toBe(500);

    // Step 4: Use BYOMEngine to make inference
    const engine = createBYOMEngine({ userId: 'user-e2e' });
    engine.addEndpoint({
      id: 'openai-endpoint',
      providerId: 'openai',
      modelId: model!.modelId,
      url: 'https://api.openai.com/v1/chat/completions',
      active: true,
      priority: 1,
      capabilities: model!.capabilities,
      costPerToken: {
        input: model!.pricing.inputPer1kTokens / 1000,
        output: model!.pricing.outputPer1kTokens / 1000,
        currency: 'USD',
      },
    });

    const inferenceResult = await engine.infer('openai-endpoint', 'Explain TypeScript generics');
    expect(inferenceResult.text).toBeTruthy();
    expect(inferenceResult.tokensUsed).toBeGreaterThan(0);
    expect(inferenceResult.cost).toBeGreaterThan(0);

    // Step 5: Record spend via SpendDashboardService
    const dashboardService = new SpendDashboardService();
    const now = Date.now();
    const spendRecord: SpendRecord = {
      id: `spend-e2e-${now}`,
      userId: 'user-e2e',
      modelId: model!.modelId,
      appId: 'creator-app-1',
      tokensInput: Math.ceil(inferenceResult.tokensUsed * 0.3),
      tokensOutput: Math.ceil(inferenceResult.tokensUsed * 0.7),
      cost: inferenceResult.cost,
      creditsUsed: 10,
      timestamp: now,
      source: 'byoc',
    };
    dashboardService.recordSpend(spendRecord);

    // Step 6: Verify allowance decremented
    const afterConsume = allowanceService.consumeAllowance('user-e2e', 10);
    expect(afterConsume.creditsRemaining).toBe(490);
    expect(afterConsume.totalUsedToday).toBe(10);

    // Step 7: Verify dashboard shows the usage
    const dashboard = dashboardService.getDashboard('user-e2e', now - 1000, now + 1000);
    expect(dashboard.totalCost).toBe(inferenceResult.cost);
    expect(dashboard.totalTokens).toBeGreaterThan(0);
    expect(dashboard.byModel.get(model!.modelId)).toBe(inferenceResult.cost);
    expect(dashboard.byApp.get('creator-app-1')).toBe(inferenceResult.cost);

    // Step 8: Verify CreatorEarningService records earning
    const creatorService = new CreatorEarningService();
    const share = creatorService.calculateEarningShare(inferenceResult.cost);

    creatorService.recordUsage({
      creatorId: 'creator-app-author',
      userId: 'user-e2e',
      modelUsage: model!.modelId,
      appId: 'creator-app-1',
      earningAmount: share.creatorAmount,
      platformFee: share.platformAmount,
      timestamp: now,
    });

    const creatorEarnings = creatorService.getCreatorEarnings('creator-app-author');
    expect(creatorEarnings.eventCount).toBe(1);
    expect(creatorEarnings.totalEarnings).toBe(share.creatorAmount);
    expect(share.creatorAmount + share.platformAmount).toBeCloseTo(inferenceResult.cost, 1);
  });

  it('local-first routing integrates with model registry', () => {
    const registry = new ModelRegistry();
    const router = new LocalFirstRouter();
    router.setRegistry(registry.listModels());

    const capabilities = router.detectCapabilities({
      webgpu: true,
      coreml: true,
      nnapi: false,
      wasmSimd: true,
      availableModels: ['phi-3-mini-4k'],
    });

    const decision = router.routeInference(
      { modelId: 'local-phi-3', tokensEstimate: 200 },
      capabilities,
    );

    expect(decision.target).toBe('local');
    expect(decision.estimatedCost).toBe(0);
  });

  it('cloud fallback works when local is unavailable', () => {
    const registry = new ModelRegistry();
    const router = new LocalFirstRouter();
    router.setRegistry(registry.listModels());

    const weakCapabilities = router.detectCapabilities({
      webgpu: false,
      coreml: false,
      nnapi: false,
      wasmSimd: false,
      availableModels: [],
    });

    const decision = router.routeInference(
      { modelId: 'openai-gpt-4o', tokensEstimate: 1000 },
      weakCapabilities,
    );

    expect(decision.target).toBe('cloud');
    expect(decision.estimatedCost).toBeGreaterThan(0);
  });

  it('allowance exhaustion prevents further usage', () => {
    const allowanceService = new DailyAllowanceService();
    allowanceService.getAllowance('user-budget', 'free');
    allowanceService.consumeAllowance('user-budget', 100);

    expect(allowanceService.isAllowanceExhausted('user-budget')).toBe(true);
    expect(() => allowanceService.consumeAllowance('user-budget', 1)).toThrow(
      'Insufficient daily allowance',
    );
  });
});
