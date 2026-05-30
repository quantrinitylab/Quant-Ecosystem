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

import { UnifiedAIService } from '../services/unified-ai-service';

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
});
