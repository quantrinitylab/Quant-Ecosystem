import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter } from '../core/model-router';
import type { AIInferenceRequest } from '../types';

/**
 * Bedrock provider-gating tests: when the engine declares that only Amazon
 * Bedrock has configured credentials, the router must never hand back a model
 * from an unconfigured provider (e.g. OpenAI's gpt-4o), and must instead pick a
 * Bedrock model for text generation.
 */
describe('ModelRouter — Bedrock provider gating', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  const req = (overrides: Partial<AIInferenceRequest> = {}): AIInferenceRequest => ({
    prompt: 'Compose a friendly reply to this email.',
    userId: 'user-1',
    app: 'quantmail',
    feature: 'email_compose',
    ...overrides,
  });

  it('registers Bedrock models in the default catalog', () => {
    const bedrockModels = router.getModels().filter((m) => m.provider === 'bedrock');
    expect(bedrockModels.length).toBeGreaterThan(0);
    expect(bedrockModels.map((m) => m.id)).toContain('us.amazon.nova-lite-v1:0');
  });

  it('selects a Bedrock model when only Bedrock is available', () => {
    router.setAvailableProviders(new Set(['bedrock']));
    const model = router.selectModel(req());
    expect(model.provider).toBe('bedrock');
    expect(model.capabilities).toContain('text_generation');
  });

  it('never selects an OpenAI model when only Bedrock is available', () => {
    router.setAvailableProviders(new Set(['bedrock']));
    // Even if a specific unavailable model is requested, it must not be returned.
    const model = router.selectModel(req({ model: 'gpt-4o' }));
    expect(model.provider).toBe('bedrock');
  });

  it('honours a specific available Bedrock model when requested', () => {
    router.setAvailableProviders(new Set(['bedrock']));
    const model = router.selectModel(req({ model: 'us.amazon.nova-lite-v1:0' }));
    expect(model.id).toBe('us.amazon.nova-lite-v1:0');
  });

  it('applies no gating when availableProviders is never set (backward compatible)', () => {
    const model = router.selectModel(req({ model: 'gpt-4o' }));
    expect(model.id).toBe('gpt-4o');
  });
});
