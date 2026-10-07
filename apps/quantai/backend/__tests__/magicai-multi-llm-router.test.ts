import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import engineRoutes from '../routes/engine';
import { multiLLMRouterService, type SupportedEngine } from '../services/multi-llm-router.service';
import { embeddableChatbotService } from '../services/embeddable-chatbot.service';

describe('MagicAI Multi-LLM Router & Embeddable Widget Service & Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(engineRoutes, { prefix: '/api/ai' });
    await app.ready();
  });

  describe('MultiLLMRouterService - Completion & Engines', () => {
    const engines: SupportedEngine[] = [
      'openai',
      'anthropic',
      'gemini',
      'deepseek',
      'grok',
      'quant-sovereign',
    ];

    for (const engine of engines) {
      it(`successfully dispatches completion for engine: ${engine}`, async () => {
        const result = await multiLLMRouterService.dispatchCompletion({
          engine,
          messages: [{ role: 'user', content: `Hello from ${engine}` }],
          temperature: 0.5,
        });

        expect(result).toBeDefined();
        expect(result.engineUsed).toBe(engine);
        expect(result.content).toContain(engine);
        expect(result.tokensUsed).toBeDefined();
        expect(result.tokensUsed.prompt).toBeGreaterThan(0);
        expect(result.tokensUsed.completion).toBeGreaterThan(0);
        expect(result.tokensUsed.total).toBe(
          result.tokensUsed.prompt + result.tokensUsed.completion,
        );
      });
    }

    it('triggers automatic failover ladder when primary engine fails', async () => {
      // Simulate failure on openai
      multiLLMRouterService.setEngineFailure('openai', true);

      const result = await multiLLMRouterService.dispatchCompletion({
        engine: 'openai',
        messages: [{ role: 'user', content: 'Test failover' }],
      });

      expect(result).toBeDefined();
      // Since openai failed, it should failover to next in ladder (quant-sovereign or anthropic etc.)
      expect(result.engineUsed).not.toBe('openai');
      expect(result.content).toBeDefined();

      // Reset failure state
      multiLLMRouterService.setEngineFailure('openai', false);
    });
  });

  describe('EmbeddableChatbotService - Snippet & Origin Validation', () => {
    it('generates correct embed script tag snippet with options', () => {
      const snippet = embeddableChatbotService.generateEmbedSnippet('bot-xyz-789', {
        theme: 'dark',
        primaryColor: '#6366f1',
        position: 'bottom-left',
      });

      expect(snippet).toContain('data-bot-id="bot-xyz-789"');
      expect(snippet).toContain('data-theme="dark"');
      expect(snippet).toContain('data-primary-color="#6366f1"');
      expect(snippet).toContain('data-position="bottom-left"');
      expect(snippet).toContain('src="https://quantmail.in/embed/quantai.js"');
    });

    it('verifies allowed embed origins correctly', () => {
      embeddableChatbotService.registerAllowedOrigins('bot-secure', ['https://trusted-domain.com']);

      expect(
        embeddableChatbotService.verifyEmbedOrigin('bot-secure', 'https://trusted-domain.com/page'),
      ).toBe(true);
      expect(
        embeddableChatbotService.verifyEmbedOrigin('bot-secure', 'https://evil-domain.com'),
      ).toBe(false);
    });
  });

  describe('Engine Fastify Routes (/api/ai/complete & /api/ai/embed/:botId/snippet)', () => {
    it('POST /api/ai/complete returns successful completion response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/complete',
        payload: {
          engine: 'anthropic',
          model: 'claude-3-5-sonnet',
          messages: [{ role: 'user', content: 'Explain quantum computing via API' }],
          temperature: 0.7,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.engineUsed).toBe('anthropic');
      expect(body.data.content).toBeDefined();
      expect(body.data.tokensUsed).toBeDefined();
    });

    it('POST /api/ai/complete returns 400 validation error on missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/complete',
        payload: {
          engine: 'invalid-engine',
          messages: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /api/ai/embed/:botId/snippet returns embed snippet', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ai/embed/bot-alpha-123/snippet?theme=light&primaryColor=%23ff5733',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.botId).toBe('bot-alpha-123');
      expect(body.data.snippet).toContain('data-bot-id="bot-alpha-123"');
      expect(body.data.snippet).toContain('data-theme="light"');
    });

    it('GET /api/ai/embed/:botId/snippet returns 403 on unauthorized origin', async () => {
      embeddableChatbotService.registerAllowedOrigins('bot-restricted', ['https://allowed.com']);

      const response = await app.inject({
        method: 'GET',
        url: '/api/ai/embed/bot-restricted/snippet?origin=https://unauthorized.com',
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
