// ============================================================================
// AI Services - Fail-Closed Behavior (Task 3.2)
// ============================================================================
//
// Validates that, in production / fail-closed mode, the AI engine never
// silently returns a simulated payload: every entry point raises an explicit
// AIProviderUnavailableError instead. The dev/test mock fallback is preserved
// when fail-closed is OFF.
//
// Fail-closed is driven deterministically via the QUANT_AI_FAIL_CLOSED env
// flag (set/restored per test) rather than relying on NODE_ENV.
//
// Requirements: 3.1 (explicit error, no mock/simulated response on provider
// failure in production) and 3.3 (silent mock-fallback paths disabled in
// production).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UnifiedAIService } from '../services/unified-ai-service';
import {
  ImageGenerationService,
  type ImageGenerationBackend,
  type BackendImage,
} from '../services/image-generation';
import { AIEngine } from '../core/engine';
import { AIProviderUnavailableError } from '../core/errors';

/** Drain an async generator so its body (and any throw) actually executes. */
async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const chunk of gen) {
    out.push(chunk);
  }
  return out;
}

/** Fake image backend whose calls deterministically throw a provider error. */
class ThrowingImageBackend implements ImageGenerationBackend {
  readonly model = 'fake-image-model';
  async generate(): Promise<BackendImage[]> {
    throw new Error('provider unavailable');
  }
  async edit(): Promise<BackendImage[]> {
    throw new Error('provider unavailable');
  }
  async createVariation(): Promise<BackendImage[]> {
    throw new Error('provider unavailable');
  }
}

describe('Fail-closed AI behavior (Requirements 3.1, 3.3)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. UnifiedAIService with NO provider configured + fail-closed ON
  //    => every entry point rejects with AIProviderUnavailableError and
  //       returns no mock payload.
  // --------------------------------------------------------------------------
  describe('UnifiedAIService — no provider + fail-closed ON', () => {
    let service: UnifiedAIService;

    beforeEach(() => {
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'true');
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');
      service = new UnifiedAIService();
    });

    it('generateText rejects with AIProviderUnavailableError (no mock payload)', async () => {
      await expect(service.generateText('What is TypeScript?')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
      await expect(service.generateText('What is TypeScript?')).rejects.toMatchObject({
        code: 'AI_PROVIDER_UNAVAILABLE',
      });
    });

    it('generateStream rejects with AIProviderUnavailableError (no mock chunks)', async () => {
      await expect(drain(service.generateStream('Tell me a story'))).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });

    it('generateEmbedding rejects with AIProviderUnavailableError (no mock vector)', async () => {
      await expect(service.generateEmbedding('embed me')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });

    it('moderateContent rejects with AIProviderUnavailableError (no fabricated safe result)', async () => {
      await expect(service.moderateContent('hello')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. moderateContent: provider IS configured but the provider call throws,
  //    fail-closed ON => rethrows a typed AIProviderUnavailableError (never a
  //    silently fabricated "safe" moderation result).
  // --------------------------------------------------------------------------
  describe('UnifiedAIService.moderateContent — provider configured but call throws + fail-closed ON', () => {
    let engine: AIEngine;
    let service: UnifiedAIService;

    beforeEach(() => {
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'true');
      // A provider is configured so the real inference path is taken...
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');

      // ...but the provider call fails.
      engine = new AIEngine();
      vi.spyOn(engine, 'infer').mockRejectedValue(new Error('upstream 503'));
      service = new UnifiedAIService(engine);
    });

    it('rethrows a typed AIProviderUnavailableError on provider failure', async () => {
      await expect(service.moderateContent('analyze this')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
      expect(engine.infer).toHaveBeenCalled();
    });

    it('does NOT return a fabricated "safe" moderation result on provider failure', async () => {
      const result = await service.moderateContent('analyze this').catch((e) => e);
      expect(result).toBeInstanceOf(AIProviderUnavailableError);
      // A fabricated mock result would be an object with a `safe` property.
      expect((result as { safe?: unknown }).safe).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 3. ImageGenerationService — fail-closed ON.
  //    - No backend => generate/edit/createVariation reject.
  //    - Injected throwing backend => error rethrown, no placeholder URL.
  // --------------------------------------------------------------------------
  describe('ImageGenerationService — fail-closed ON', () => {
    beforeEach(() => {
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'true');
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('IMAGE_GEN_PROVIDER', '');
    });

    it('generate rejects with AIProviderUnavailableError when no backend is configured', async () => {
      const service = new ImageGenerationService();
      expect(service.isAvailable()).toBe(false);
      await expect(service.generate({ prompt: 'a cat' }, 'user-1')).rejects.toBeInstanceOf(
        AIProviderUnavailableError,
      );
    });

    it('edit rejects with AIProviderUnavailableError when no backend is configured', async () => {
      const service = new ImageGenerationService();
      await expect(
        service.edit({ prompt: 'add a hat', imageUrl: 'https://example.com/i.png' }, 'user-1'),
      ).rejects.toBeInstanceOf(AIProviderUnavailableError);
    });

    it('createVariation rejects with AIProviderUnavailableError when no backend is configured', async () => {
      const service = new ImageGenerationService();
      await expect(
        service.createVariation('https://example.com/i.png', 'user-1', 2),
      ).rejects.toBeInstanceOf(AIProviderUnavailableError);
    });

    it('generate rethrows the backend error (no placeholder URL) when the backend throws', async () => {
      const service = new ImageGenerationService(new ThrowingImageBackend());
      const error = await service.generate({ prompt: 'a dog' }, 'user-1').catch((e) => e);
      expect(error).toBeInstanceOf(AIProviderUnavailableError);
      // Never a fabricated placeholder result.
      expect((error as { url?: unknown }).url).toBeUndefined();
    });

    it('createVariation rethrows the backend error when the backend throws', async () => {
      const service = new ImageGenerationService(new ThrowingImageBackend());
      await expect(
        service.createVariation('https://example.com/i.png', 'user-1', 1),
      ).rejects.toBeInstanceOf(AIProviderUnavailableError);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Control: fail-closed OFF (QUANT_AI_FAIL_CLOSED=false) + no provider.
  //    The mock/placeholder fallback (dev behavior) is preserved.
  // --------------------------------------------------------------------------
  describe('Control — fail-closed OFF preserves dev mock/placeholder fallback', () => {
    beforeEach(() => {
      vi.stubEnv('QUANT_AI_FAIL_CLOSED', 'false');
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');
      vi.stubEnv('IMAGE_GEN_PROVIDER', '');
    });

    it('UnifiedAIService.generateText returns a mock response', async () => {
      const service = new UnifiedAIService();
      const response = await service.generateText('What is TypeScript?');
      expect(response.model).toBe('mock-model');
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
    });

    it('UnifiedAIService.generateEmbedding returns a mock vector', async () => {
      const service = new UnifiedAIService();
      const embedding = await service.generateEmbedding('embed me');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536);
    });

    it('UnifiedAIService.moderateContent returns a mock safe result', async () => {
      const service = new UnifiedAIService();
      const result = await service.moderateContent('hello');
      expect(result.safe).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('ImageGenerationService.generate returns a placeholder result', async () => {
      const service = new ImageGenerationService();
      const result = await service.generate({ prompt: 'a cat' }, 'user-1');
      expect(result.url).toContain('placeholder.quant.ai');
      expect(result.model).toBe('dall-e-3-stub');
    });
  });
});
