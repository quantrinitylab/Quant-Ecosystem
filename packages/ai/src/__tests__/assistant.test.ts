import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK modules
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

import { generateText } from 'ai';
import { ToolRegistry } from '../assistant/tool-registry';
import { IntentRouter } from '../assistant/intent-router';
import { ActionExecutor } from '../assistant/action-executor';
import { UniversalAssistant } from '../assistant/assistant';
import { AIEngine } from '../core/engine';
import type { AITool, AssistantContext } from '../assistant/types';

const mockContext: AssistantContext = {
  userId: 'user1',
  currentApp: 'quantchat',
  conversationHistory: [],
  crossAppState: {},
};

function createMockTool(name: string, app: string): AITool {
  return {
    name,
    description: `Mock tool: ${name} for ${app}`,
    parameters: {
      input: { type: 'string', description: 'Input value', required: true },
    },
    handler: async (args) => ({
      success: true,
      data: args,
      displayMessage: `Executed ${name} with input: ${args['input']}`,
    }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves tools for an app', () => {
    const tools = [createMockTool('sendMessage', 'quantchat')];
    registry.registerApp('quantchat', tools);

    const result = registry.getToolsForApp('quantchat');
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('sendMessage');
  });

  it('returns empty array for unregistered app', () => {
    const result = registry.getToolsForApp('quantmail');
    expect(result).toEqual([]);
  });

  it('returns all tools across all apps', () => {
    registry.registerApp('quantchat', [createMockTool('sendMessage', 'quantchat')]);
    registry.registerApp('quantmail', [createMockTool('composeEmail', 'quantmail')]);
    registry.registerApp('quantai', [createMockTool('generateImage', 'quantai')]);

    const all = registry.getAllTools();
    expect(all).toHaveLength(3);
  });

  it('finds a specific tool by app and name', () => {
    registry.registerApp('quantchat', [
      createMockTool('sendMessage', 'quantchat'),
      createMockTool('createGroupChat', 'quantchat'),
    ]);

    const tool = registry.findTool('quantchat', 'createGroupChat');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('createGroupChat');
  });

  it('returns undefined for non-existent tool', () => {
    registry.registerApp('quantchat', [createMockTool('sendMessage', 'quantchat')]);

    const tool = registry.findTool('quantchat', 'nonExistent');
    expect(tool).toBeUndefined();
  });

  it('generates prompt descriptions for all tools', () => {
    registry.registerApp('quantchat', [createMockTool('sendMessage', 'quantchat')]);
    registry.registerApp('quantmail', [createMockTool('composeEmail', 'quantmail')]);

    const description = registry.getToolDescriptionsForPrompt();
    expect(description).toContain('quantchat');
    expect(description).toContain('sendMessage');
    expect(description).toContain('quantmail');
    expect(description).toContain('composeEmail');
  });
});

describe('IntentRouter', () => {
  let router: IntentRouter;
  let registry: ToolRegistry;
  let engine: AIEngine;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    engine = new AIEngine({ enableCaching: false });
    registry = new ToolRegistry();
    registry.registerApp('quantchat', [createMockTool('sendMessage', 'quantchat')]);
    registry.registerApp('quantmail', [createMockTool('composeEmail', 'quantmail')]);
    registry.registerApp('quantai', [createMockTool('analyzeCode', 'quantai')]);
    router = new IntentRouter(engine, registry);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('classifies "send a message" to quantchat sendMessage via keywords', async () => {
    // AI will fail (mock doesn't return valid JSON), so keyword fallback is used
    vi.mocked(generateText).mockRejectedValue(new Error('No API key'));

    const result = await router.parseIntent('send a message to John', mockContext);
    expect(result.targetApp).toBe('quantchat');
    expect(result.toolName).toBe('sendMessage');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies "compose email" to quantmail via keywords', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('No API key'));

    const result = await router.parseIntent('compose an email to the team', mockContext);
    expect(result.targetApp).toBe('quantmail');
    expect(result.toolName).toBe('composeEmail');
  });

  it('uses AI classification when available', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        targetApp: 'quantchat',
        toolName: 'sendMessage',
        confidence: 0.95,
        parsedArgs: { recipient: 'John', content: 'Hello' },
      }),
      usage: { promptTokens: 50, completionTokens: 30 },
      finishReason: 'stop',
    } as never);

    const result = await router.parseIntent('tell John hello', mockContext);
    expect(result.targetApp).toBe('quantchat');
    expect(result.toolName).toBe('sendMessage');
    expect(result.confidence).toBe(0.95);
  });

  it('falls back to keywords when AI returns invalid JSON', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'This is not valid JSON',
      usage: { promptTokens: 50, completionTokens: 30 },
      finishReason: 'stop',
    } as never);

    const result = await router.parseIntent('send a message', mockContext);
    expect(result.targetApp).toBe('quantchat');
    expect(result.toolName).toBe('sendMessage');
  });
});

describe('ActionExecutor', () => {
  let executor: ActionExecutor;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.registerApp('quantchat', [createMockTool('sendMessage', 'quantchat')]);
    executor = new ActionExecutor(registry);
  });

  it('executes a tool successfully', async () => {
    const result = await executor.execute(
      'quantchat',
      'sendMessage',
      { input: 'Hello world' },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.displayMessage).toContain('sendMessage');
    expect(result.data).toEqual({ input: 'Hello world' });
  });

  it('returns error for missing tool', async () => {
    const result = await executor.execute('quantchat', 'nonExistent', {}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for missing required parameters', async () => {
    const result = await executor.execute('quantchat', 'sendMessage', {}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required parameter');
  });

  it('handles tool handler errors gracefully', async () => {
    const errorTool: AITool = {
      name: 'failTool',
      description: 'A tool that throws',
      parameters: {},
      handler: async () => {
        throw new Error('Something broke');
      },
    };
    registry.registerApp('quantai', [errorTool]);

    const result = await executor.execute('quantai', 'failTool', {}, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Something broke');
  });
});

describe('UniversalAssistant', () => {
  let assistant: UniversalAssistant;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    // Make AI classification fail so keyword fallback is used
    vi.mocked(generateText).mockRejectedValue(new Error('No API key'));

    const engine = new AIEngine({ enableCaching: false });
    assistant = new UniversalAssistant(engine);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('processes a message end-to-end', async () => {
    const response = await assistant.processMessage(
      'send a message to John saying hello',
      mockContext,
    );

    expect(response.message).toBeDefined();
    expect(response.action).toBeDefined();
    expect(response.action!.success).toBe(true);
  });

  it('returns suggestions with the response', async () => {
    const response = await assistant.processMessage('send a message to Alice', mockContext);

    expect(response.suggestions).toBeDefined();
    expect(response.suggestions!.length).toBeGreaterThan(0);
  });

  it('exposes the tool registry', () => {
    const registry = assistant.getRegistry();
    const allTools = registry.getAllTools();
    // Should have tools from all 8 registered apps
    expect(allTools.length).toBeGreaterThan(10);
  });

  it('can register and use tools for all 9 Quant apps', () => {
    const registry = assistant.getRegistry();
    const apps = [
      'quantchat',
      'quantmail',
      'quantai',
      'quantsync',
      'quantube',
      'quantneon',
      'quantmax',
      'quantads',
    ] as const;

    for (const app of apps) {
      const tools = registry.getToolsForApp(app);
      expect(tools.length).toBeGreaterThan(0);
    }
  });
});
