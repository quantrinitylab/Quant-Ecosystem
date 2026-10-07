import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ImageGenerationService,
  type ImageGenerationBackend,
  type BackendImage,
} from '../services/image-generation';

/** Fake backend exercising the "real-when-configured" path deterministically. */
class FakeImageBackend implements ImageGenerationBackend {
  readonly model = 'fake-image-model';
  generateCalls = 0;
  constructor(private readonly mode: 'ok' | 'empty' | 'throw' = 'ok') {}

  private maybeFail(): BackendImage[] {
    if (this.mode === 'throw') throw new Error('provider unavailable');
    if (this.mode === 'empty') return [];
    return [{ url: 'https://cdn.example.com/real.png', revisedPrompt: 'revised by provider' }];
  }
  async generate(): Promise<BackendImage[]> {
    this.generateCalls++;
    return this.maybeFail();
  }
  async edit(): Promise<BackendImage[]> {
    return this.maybeFail();
  }
  async createVariation(_url: string, n: number): Promise<BackendImage[]> {
    if (this.mode === 'throw') throw new Error('provider unavailable');
    if (this.mode === 'empty') return [];
    return Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example.com/var${i}.png` }));
  }
}

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;

  beforeEach(() => {
    service = new ImageGenerationService();
  });

  afterEach(() => {
    // cleanup
  });

  describe('isAvailable', () => {
    it('returns false when no API key is set', () => {
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('generate', () => {
    it('returns a stub result', async () => {
      const result = await service.generate(
        { prompt: 'A beautiful sunset over mountains' },
        'user-1',
      );

      expect(result.id).toBeDefined();
      expect(result.url).toContain('placeholder.quant.ai');
      expect(result.revisedPrompt).toBe('A beautiful sunset over mountains');
      expect(result.size).toBe('1024x1024');
      expect(result.style).toBe('natural');
      expect(result.quality).toBe('standard');
      expect(result.model).toBe('dall-e-3-stub');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses specified size, style, and quality', async () => {
      const result = await service.generate(
        {
          prompt: 'A robot',
          size: '512x512',
          style: 'digital-art',
          quality: 'hd',
        },
        'user-1',
      );

      expect(result.size).toBe('512x512');
      expect(result.style).toBe('digital-art');
      expect(result.quality).toBe('hd');
    });
  });

  describe('edit', () => {
    it('returns a stub edit result', async () => {
      const result = await service.edit(
        {
          prompt: 'Add a hat',
          imageUrl: 'https://example.com/image.png',
        },
        'user-1',
      );

      expect(result.id).toBeDefined();
      expect(result.url).toContain('edit');
      expect(result.revisedPrompt).toBe('Add a hat');
    });
  });

  describe('createVariation', () => {
    it('returns the requested number of variations', async () => {
      const results = await service.createVariation('https://example.com/image.png', 'user-1', 3);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.id).toContain('img_var');
        expect(result.url).toContain('variation');
      }
    });

    it('defaults to 1 variation', async () => {
      const results = await service.createVariation('https://example.com/image.png', 'user-1');

      expect(results).toHaveLength(1);
    });
  });

  describe('getSupportedSizes', () => {
    it('returns all supported sizes', () => {
      const sizes = service.getSupportedSizes();
      expect(sizes).toContain('256x256');
      expect(sizes).toContain('1024x1024');
      expect(sizes).toContain('1792x1024');
      expect(sizes.length).toBe(5);
    });
  });

  describe('getSupportedStyles', () => {
    it('returns all supported styles', () => {
      const styles = service.getSupportedStyles();
      expect(styles).toContain('natural');
      expect(styles).toContain('vivid');
      expect(styles).toContain('anime');
      expect(styles.length).toBe(5);
    });
  });

  describe('real backend mode (configured)', () => {
    it('isAvailable returns true when a backend is injected', () => {
      const real = new ImageGenerationService(new FakeImageBackend('ok'));
      expect(real.isAvailable()).toBe(true);
    });

    it('uses the real backend result instead of the placeholder', async () => {
      const backend = new FakeImageBackend('ok');
      const real = new ImageGenerationService(backend);
      const result = await real.generate({ prompt: 'a cat' }, 'user-1');

      expect(backend.generateCalls).toBe(1);
      expect(result.url).toBe('https://cdn.example.com/real.png');
      expect(result.revisedPrompt).toBe('revised by provider');
      expect(result.model).toBe('fake-image-model');
      expect(result.url).not.toContain('placeholder.quant.ai');
    });

    it('returns real variations from the backend', async () => {
      const real = new ImageGenerationService(new FakeImageBackend('ok'));
      const results = await real.createVariation('https://example.com/i.png', 'user-1', 2);
      expect(results).toHaveLength(2);
      expect(results[0]!.model).toBe('fake-image-model');
      expect(results[0]!.url).toContain('cdn.example.com');
    });

    it('falls back to the placeholder (and does not throw) when the backend errors', async () => {
      const real = new ImageGenerationService(new FakeImageBackend('throw'));
      const result = await real.generate({ prompt: 'a dog' }, 'user-1');
      expect(result.url).toContain('placeholder.quant.ai');
      expect(result.model).toBe('dall-e-3-stub');
    });

    it('falls back to the placeholder when the backend returns no images', async () => {
      const real = new ImageGenerationService(new FakeImageBackend('empty'));
      const result = await real.generate({ prompt: 'nothing' }, 'user-1');
      expect(result.url).toContain('placeholder.quant.ai');
    });
  });
});
