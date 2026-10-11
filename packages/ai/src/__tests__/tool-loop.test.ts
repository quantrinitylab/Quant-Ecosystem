import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK modules (same pattern as engine.test.ts)
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

// Hoisted mock so the engine module loads in environments without the AWS SDK.
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(),
  ConverseCommand: vi.fn(),
  ConverseStreamCommand: vi.fn(),
}));

import { generateText } from 'ai';
import { AIEngine } from '../core/engine';
import type { ToolCall, ToolDefinition, ToolLoopHooks } from '../core/tool-calling';

const searchTool: ToolDefinition = {
  name: 'quantmail.search',
  description: 'Search emails',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
};

function toolCallResult(text: string, toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>) {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5 },
    toolCalls,
  } as never;
}

function textResult(text: string) {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5 },
  } as never;
}

describe('AIEngine tool-calling loop', () => {
  let engine: AIEngine;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    engine = new AIEngine({
      enableCaching: false,
      costBudgetPerUser: 100.0,
      costBudgetPerDay: 1000.0,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  const baseRequest = (overrides: Record<string, unknown> = {}) => ({
    prompt: 'Find my unread emails',
    userId: 'user1',
    app: 'quantai' as const,
    feature: 'test-loop',
    tools: [searchTool],
    ...overrides,
  });

  it('closes the loop: tool_calls -> check -> execute -> feed back -> final answer', async () => {
    const call: ToolCall = {
      id: 'call-1',
      name: 'quantmail.search',
      arguments: { query: 'unread' },
    };
    vi.mocked(generateText)
      .mockResolvedValueOnce(
        toolCallResult('', [{ toolCallId: 'call-1', toolName: 'quantmail.search', input: { query: 'unread' } }]),
      )
      .mockResolvedValueOnce(textResult('You have 3 unread emails.'));

    const checkToolCall = vi.fn(async () => ({ decision: 'allow' as const }));
    const executeToolCall = vi.fn(async () => ({
      toolCallId: 'call-1',
      name: 'quantmail.search',
      success: true,
      result: { messages: ['a', 'b', 'c'] },
    }));
    const hooks: ToolLoopHooks = { checkToolCall, executeToolCall };

    const response = await engine.infer(baseRequest({ toolHooks: hooks }));

    expect(response.finishReason).toBe('stop');
    expect(response.content).toContain('3 unread emails');
    expect(checkToolCall).toHaveBeenCalledTimes(1);
    expect(checkToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'call-1', name: 'quantmail.search' }),
      expect.objectContaining({ userId: 'user1', permissionTier: 1 }),
    );
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: { query: 'unread' } }),
      expect.objectContaining({ userId: 'user1' }),
    );
    // Two model rounds; the second carries the tool result back.
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    const secondMessages = vi.mocked(generateText).mock.calls[1]?.[0]?.messages as Array<{ role: string }>;
    expect(secondMessages.some((m) => m.role === 'tool')).toBe(true);
    expect(secondMessages.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('enforces the step cap and returns unexecuted calls when truncated', async () => {
    vi.mocked(generateText).mockImplementation(async () =>
      toolCallResult('', [{ toolCallId: 'call-x', toolName: 'quantmail.search', input: {} }]),
    );
    const executeToolCall = vi.fn(async (call: ToolCall) => ({
      toolCallId: call.id,
      name: call.name,
      success: true,
      result: {},
    }));
    const hooks: ToolLoopHooks = {
      checkToolCall: async () => ({ decision: 'allow' as const }),
      executeToolCall,
    };

    const response = await engine.infer(baseRequest({ toolHooks: hooks, maxToolRounds: 1 }));

    // 1 tool round executed, then the cap hit: calls handed back unexecuted.
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolLoopTruncated).toBe(true);
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]?.name).toBe('quantmail.search');
  });

  it('holds tier-2+ calls for confirmation WITHOUT executing them', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      toolCallResult('', [{ toolCallId: 'call-2', toolName: 'quantmail.send', input: {} }]),
    );
    const checkToolCall = vi.fn(async () => ({
      decision: 'hold' as const,
      holdToken: 'plan-123',
      reason: 'Allowed with confirmation (tier 2)',
    }));
    const executeToolCall = vi.fn();
    const hooks: ToolLoopHooks = { checkToolCall, executeToolCall };

    const response = await engine.infer(baseRequest({ toolHooks: hooks }));

    expect(response.finishReason).toBe('confirmation_required');
    expect(response.pendingConfirmation?.holdToken).toBe('plan-123');
    expect(response.pendingConfirmation?.calls).toHaveLength(1);
    expect(executeToolCall).not.toHaveBeenCalled();
    // Loop stopped after the first round.
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
  });

  it('feeds denials back to the model as tool errors instead of executing', async () => {
    vi.mocked(generateText)
      .mockResolvedValueOnce(
        toolCallResult('', [{ toolCallId: 'call-3', toolName: 'quantads.set-budget', input: {} }]),
      )
      .mockResolvedValueOnce(textResult('I cannot adjust ad budgets.'));
    const executeToolCall = vi.fn();
    const hooks: ToolLoopHooks = {
      checkToolCall: async () => ({ decision: 'deny' as const, reason: 'Insufficient permissions' }),
      executeToolCall,
    };

    const response = await engine.infer(baseRequest({ toolHooks: hooks }));

    expect(response.finishReason).toBe('stop');
    expect(response.content).toContain('cannot adjust');
    expect(executeToolCall).not.toHaveBeenCalled();
    const secondOptions = vi.mocked(generateText).mock.calls[1]?.[0] as { messages: Array<{ role: string; content: unknown }> };
    const toolMsg = secondOptions.messages.find((m) => m.role === 'tool');
    expect(JSON.stringify(toolMsg?.content)).toContain('Denied: Insufficient permissions');
  });

  it('keeps legacy behavior (no loop) when hooks are absent', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      toolCallResult('', [{ toolCallId: 'call-4', toolName: 'quantmail.search', input: {} }]),
    );

    const response = await engine.infer(baseRequest());

    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toHaveLength(1);
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the total loop timeout elapses', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      toolCallResult('', [{ toolCallId: 'call-5', toolName: 'quantmail.search', input: {} }]),
    );
    const hooks: ToolLoopHooks = {
      checkToolCall: async () => ({ decision: 'allow' as const }),
      // Never resolves: the deadline must win.
      executeToolCall: () => new Promise(() => undefined) as never,
    };

    await expect(
      engine.infer(baseRequest({ toolHooks: hooks, toolLoopTimeoutMs: 20 })),
    ).rejects.toThrow(/timed out/i);
  });
});
