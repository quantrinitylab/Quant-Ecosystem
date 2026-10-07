import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK modules to prevent real API calls
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'google' })),
}));

const mockCreateEmbedding = vi.fn();

function MockOpenAI(this: any, _config: { apiKey: string }) {
  this.embeddings = { create: mockCreateEmbedding };
}

vi.mock('openai', () => ({
  default: MockOpenAI,
}));

import { generateText } from 'ai';
import { UnifiedAIService } from '../services/unified-ai-service';
import { AIEngine } from '../core/engine';

describe('UnifiedAIService', () => {
  let service: UnifiedAIService;

  beforeEach(() => {
    // Ensure no API keys are set (mock mode)
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    service = new UnifiedAIService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('instantiates without errors', () => {
      expect(service).toBeInstanceOf(UnifiedAIService);
    });

    it('accepts an optional AIEngine parameter', () => {
      const customService = new UnifiedAIService();
      expect(customService).toBeInstanceOf(UnifiedAIService);
    });
  });

  describe('generateText (mock mode)', () => {
    it('returns a valid AIInferenceResponse when no API keys are set', async () => {
      const response = await service.generateText('What is TypeScript?');

      expect(response).toBeDefined();
      expect(response.id).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.model).toBe('mock-model');
      expect(response.finishReason).toBe('stop');
      expect(response.cached).toBe(false);
    });

    it('includes the prompt context in the mock response', async () => {
      const response = await service.generateText('Tell me about quantum computing');

      expect(response.content).toContain('quantum computing');
    });

    it('returns valid token usage', async () => {
      const response = await service.generateText('Hello');

      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBeGreaterThan(0);
      expect(response.usage.totalTokens).toBe(
        response.usage.promptTokens + response.usage.completionTokens,
      );
      expect(response.usage.estimatedCost).toBe(0);
    });
  });

  describe('generateStream (mock mode)', () => {
    it('yields StreamChunk objects', async () => {
      const chunks: Array<{ id: string; content: string; done: boolean; finishReason?: string }> =
        [];

      for await (const chunk of service.generateStream('Tell me a story')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('ends with a done:true chunk', async () => {
      const chunks: Array<{ id: string; content: string; done: boolean; finishReason?: string }> =
        [];

      for await (const chunk of service.generateStream('Hello world')) {
        chunks.push(chunk);
      }

      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk).toBeDefined();
      expect(lastChunk!.done).toBe(true);
      expect(lastChunk!.finishReason).toBe('stop');
    });

    it('non-final chunks have done:false', async () => {
      const chunks: Array<{ id: string; content: string; done: boolean; finishReason?: string }> =
        [];

      for await (const chunk of service.generateStream('Test prompt')) {
        chunks.push(chunk);
      }

      const nonFinalChunks = chunks.slice(0, -1);
      for (const chunk of nonFinalChunks) {
        expect(chunk.done).toBe(false);
      }
    });
  });

  describe('generateEmbedding (mock mode)', () => {
    it('returns an array of 1536 numbers', async () => {
      const embedding = await service.generateEmbedding('Some text to embed');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536);
    });

    it('returns numeric values', async () => {
      const embedding = await service.generateEmbedding('Test');

      for (const value of embedding) {
        expect(typeof value).toBe('number');
        expect(isNaN(value)).toBe(false);
      }
    });

    it('returns small values (normalized range)', async () => {
      const embedding = await service.generateEmbedding('Test');

      for (const value of embedding) {
        expect(Math.abs(value)).toBeLessThan(1);
      }
    });
  });

  describe('moderateContent (mock mode)', () => {
    it('returns a valid ModerationResult with safe:true', async () => {
      const result = await service.moderateContent('Hello, how are you?');

      expect(result).toBeDefined();
      expect(result.safe).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('includes moderation categories', async () => {
      const result = await service.moderateContent('This is a normal message');

      expect(Array.isArray(result.categories)).toBe(true);
      expect(result.categories.length).toBeGreaterThan(0);

      for (const category of result.categories) {
        expect(category.name).toBeDefined();
        expect(typeof category.score).toBe('number');
        expect(typeof category.flagged).toBe('boolean');
      }
    });

    it('has low overall score in mock mode', async () => {
      const result = await service.moderateContent('Testing moderation');

      expect(result.overallScore).toBeLessThan(0.5);
    });
  });

  describe('generateText (real mode)', () => {
    let realService: UnifiedAIService;
    let mockEngine: AIEngine;

    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');

      mockEngine = new AIEngine();
      vi.spyOn(mockEngine, 'infer').mockResolvedValue({
        id: 'real_req_1',
        content: 'Real engine response',
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, estimatedCost: 0 },
        latencyMs: 200,
        cached: false,
      });

      realService = new UnifiedAIService(mockEngine);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('calls AIEngine.infer() when OPENAI_API_KEY is set', async () => {
      const response = await realService.generateText('What is TypeScript?');

      expect(mockEngine.infer).toHaveBeenCalledTimes(1);
      expect(mockEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'What is TypeScript?',
          userId: 'anonymous',
          app: 'quantai',
          feature: 'unified_text',
        }),
      );
      expect(response.content).toBe('Real engine response');
      expect(response.model).toBe('gpt-4o');
    });

    it('does not call generateText AI SDK directly', async () => {
      await realService.generateText('Hello');

      expect(generateText).not.toHaveBeenCalled();
    });
  });

  describe('generateEmbedding (real mode)', () => {
    let realService: UnifiedAIService;

    beforeEach(() => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');

      mockCreateEmbedding.mockResolvedValue({
        data: [{ embedding: Array.from({ length: 1536 }, (_, i) => i / 1536) }],
      });

      realService = new UnifiedAIService();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('calls OpenAI embeddings.create with text-embedding-3-large', async () => {
      const embedding = await realService.generateEmbedding('Test embedding text');

      expect(mockCreateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockCreateEmbedding).toHaveBeenCalledWith({
        model: 'text-embedding-3-large',
        input: 'Test embedding text',
      });
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(1536);
    });

    it('returns the embedding array from the API response', async () => {
      const expectedEmbedding = [0.1, 0.2, 0.3];
      mockCreateEmbedding.mockResolvedValue({
        data: [{ embedding: expectedEmbedding }],
      });

      const embedding = await realService.generateEmbedding('Test');

      expect(embedding).toEqual(expectedEmbedding);
    });

    it('does not return mock embedding when API key is set', async () => {
      const embedding = await realService.generateEmbedding('Some text');

      expect(mockCreateEmbedding).toHaveBeenCalled();
      expect(embedding.length).toBe(1536);
    });

    it('throws on API error', async () => {
      mockCreateEmbedding.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(realService.generateEmbedding('Test')).rejects.toThrow(
        'Embedding generation failed: API rate limit exceeded',
      );
    });
  });
});
