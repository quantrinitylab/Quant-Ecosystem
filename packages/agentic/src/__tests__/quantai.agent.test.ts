import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QuantAIAgent } from '../agents/quantai.agent.js';
import type { UnifiedAIService } from '@quant/ai';

describe('QuantAIAgent - quantai_chat tool', () => {
  let mockGenerateText: ReturnType<typeof vi.fn>;
  let mockAiService: UnifiedAIService;
  let agent: QuantAIAgent;

  beforeEach(() => {
    mockGenerateText = vi.fn();
    mockAiService = {
      generateText: mockGenerateText,
    } as unknown as UnifiedAIService;

    agent = new QuantAIAgent(mockAiService);
  });

  it('calls UnifiedAIService.generateText with correct parameters', async () => {
    mockGenerateText.mockResolvedValue({
      id: 'resp-1',
      content: 'Hello from AI',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        estimatedCost: 0.0001,
      },
      latencyMs: 100,
      cached: false,
    });

    const tool = (agent as any).tools.get('quantai_chat');
    expect(tool).toBeDefined();

    await tool.execute({
      message: 'What is AI?',
      model: 'gpt-4o',
      temperature: 0.7,
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).toHaveBeenCalledWith('What is AI?', {
      model: 'gpt-4o',
      temperature: 0.7,
    });
  });

  it('returns response and model from the AI service', async () => {
    mockGenerateText.mockResolvedValue({
      id: 'resp-2',
      content: 'AI is artificial intelligence.',
      model: 'claude-3-opus',
      finishReason: 'stop',
      usage: {
        promptTokens: 8,
        completionTokens: 6,
        totalTokens: 14,
        estimatedCost: 0.0002,
      },
      latencyMs: 200,
      cached: false,
    });

    const tool = (agent as any).tools.get('quantai_chat');
    const result = await tool.execute({
      message: 'Define AI',
      model: 'claude-3-opus',
    });

    expect(result).toEqual({
      response: 'AI is artificial intelligence.',
      model: 'claude-3-opus',
    });
    expect(result.response).toBeTypeOf('string');
    expect(result.model).toBeTypeOf('string');
  });

  it('uses default UnifiedAIService when none provided', () => {
    const defaultAgent = new QuantAIAgent();
    expect(defaultAgent).toBeDefined();
  });
});
