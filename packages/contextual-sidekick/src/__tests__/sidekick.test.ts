import { describe, it, expect, beforeEach } from 'vitest';
import { SidekickEngine } from '../sidekick-engine';
import { ContextDetector } from '../context-detector';
import { ToolAdapter } from '../tool-adapter';
import type { SidekickTool, SidekickContext, AppContextMapping } from '../types';

function createMockTool(overrides: Partial<SidekickTool> = {}): SidekickTool {
  return {
    id: 'tool-1',
    name: 'Test Tool',
    description: 'A test tool',
    icon: 'wrench',
    category: 'general',
    applicableApps: ['quantmail'],
    applicableResources: ['email'],
    priority: 5,
    action: async (_ctx) => ({ success: true, message: 'done' }),
    ...overrides,
  };
}

describe('SidekickEngine', () => {
  let engine: SidekickEngine;

  beforeEach(() => {
    engine = new SidekickEngine();
  });

  it('registerTool adds to internal registry', () => {
    const tool = createMockTool({ id: 'reply-tool', name: 'Reply' });
    engine.registerTool(tool);

    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };

    const panel = engine.getPanel(context);
    expect(panel.tools).toHaveLength(1);
    expect(panel.tools[0]!.id).toBe('reply-tool');
  });

  it('getPanel returns tools filtered by current app', () => {
    engine.registerTool(
      createMockTool({ id: 'mail-tool', applicableApps: ['quantmail'], priority: 3 }),
    );
    engine.registerTool(
      createMockTool({ id: 'chat-tool', applicableApps: ['quantchat'], priority: 3 }),
    );
    engine.registerTool(
      createMockTool({ id: 'docs-tool', applicableApps: ['quantdocs'], priority: 3 }),
    );

    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };

    const panel = engine.getPanel(context);
    expect(panel.tools).toHaveLength(1);
    expect(panel.tools[0]!.id).toBe('mail-tool');
  });

  it('getPanel returns tools filtered by selected resource type', () => {
    engine.registerTool(
      createMockTool({
        id: 'email-tool',
        applicableApps: ['quantmail'],
        applicableResources: ['email'],
        priority: 5,
      }),
    );
    engine.registerTool(
      createMockTool({
        id: 'doc-tool',
        applicableApps: ['quantmail'],
        applicableResources: ['document'],
        priority: 5,
      }),
    );

    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      selectedResource: { id: 'r1', type: 'email', title: 'Important Email' },
      recentActions: [],
    };

    const panel = engine.getPanel(context);
    expect(panel.tools).toHaveLength(1);
    expect(panel.tools[0]!.id).toBe('email-tool');
  });

  it('getPanel sorts tools by priority', () => {
    engine.registerTool(createMockTool({ id: 'low', applicableApps: ['quantmail'], priority: 1 }));
    engine.registerTool(
      createMockTool({ id: 'high', applicableApps: ['quantmail'], priority: 10 }),
    );
    engine.registerTool(
      createMockTool({ id: 'medium', applicableApps: ['quantmail'], priority: 5 }),
    );

    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };

    const panel = engine.getPanel(context);
    expect(panel.tools[0]!.id).toBe('high');
    expect(panel.tools[1]!.id).toBe('medium');
    expect(panel.tools[2]!.id).toBe('low');
  });

  it('executeTool calls the tool action', async () => {
    const tool = createMockTool({
      id: 'action-tool',
      action: async (ctx) => ({
        success: true,
        message: `Executed for ${ctx.userId}`,
        data: { app: ctx.currentApp },
      }),
    });
    engine.registerTool(tool);

    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user42',
      recentActions: [],
    };

    const result = await engine.executeTool('action-tool', context);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Executed for user42');
    expect(result.data).toEqual({ app: 'quantmail' });
  });

  it('executeTool returns error for non-existent tool', async () => {
    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };

    const result = await engine.executeTool('nonexistent', context);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Tool not found');
  });

  it('registerAppMapping stores mappings', () => {
    const mapping: AppContextMapping = {
      app: 'quantmail',
      defaultTools: ['reply', 'forward'],
      resourceToolMap: new Map([['email', ['reply', 'forward', 'archive']]]),
    };

    engine.registerAppMapping(mapping);

    // Verify no error thrown and engine still works
    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };
    const panel = engine.getPanel(context);
    expect(panel.contextSummary).toContain('quantmail');
  });
});

describe('ContextDetector', () => {
  let detector: ContextDetector;

  beforeEach(() => {
    detector = new ContextDetector();
  });

  it('detectResourceType works for known types', () => {
    expect(detector.detectResourceType({ type: 'email' })).toBe('email');
    expect(detector.detectResourceType({ type: 'document' })).toBe('document');
    expect(detector.detectResourceType({ type: 'video' })).toBe('video');
    expect(detector.detectResourceType({ type: 'task' })).toBe('task');
    expect(detector.detectResourceType({ kind: 'calendar' })).toBe('event');
    expect(detector.detectResourceType({ category: 'chat' })).toBe('message');
  });

  it('detectResourceType returns null for unknown types', () => {
    expect(detector.detectResourceType({ type: 'unknown-thing' })).toBeNull();
    expect(detector.detectResourceType({})).toBeNull();
  });

  it('inferActions returns relevant actions for email context', () => {
    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      selectedResource: { id: 'e1', type: 'email', title: 'Hello' },
      recentActions: [],
    };

    const actions = detector.inferActions(context);
    expect(actions).toContain('reply');
    expect(actions).toContain('forward');
    expect(actions).toContain('summarize');
  });

  it('inferActions returns default actions when no resource is selected', () => {
    const context: SidekickContext = {
      currentApp: 'quantmail',
      userId: 'user1',
      recentActions: [],
    };

    const actions = detector.inferActions(context);
    expect(actions).toContain('search');
    expect(actions).toContain('create');
    expect(actions).toContain('navigate');
  });
});

describe('ToolAdapter', () => {
  let adapter: ToolAdapter;

  beforeEach(() => {
    adapter = new ToolAdapter();
  });

  it('adaptForApp modifies tool name/description for target app', () => {
    const baseTool = createMockTool({
      id: 'share',
      name: 'Share',
      description: 'Share this resource',
    });

    const adapted = adapter.adaptForApp(baseTool, 'quantmail');
    expect(adapted.id).toBe('share-quantmail');
    expect(adapted.name).toBe('Share via email');
    expect(adapted.description).toContain('via email');
    expect(adapted.applicableApps).toEqual(['quantmail']);
  });

  it('createVariants produces per-app tool variants', () => {
    const baseTool = createMockTool({
      id: 'share',
      name: 'Share',
      description: 'Share this resource',
    });

    const variants = adapter.createVariants(baseTool, ['quantmail', 'quantchat', 'quantsync']);
    expect(variants).toHaveLength(3);
    expect(variants[0]!.id).toBe('share-quantmail');
    expect(variants[0]!.name).toBe('Share via email');
    expect(variants[1]!.id).toBe('share-quantchat');
    expect(variants[1]!.name).toBe('Share in chat');
    expect(variants[2]!.id).toBe('share-quantsync');
    expect(variants[2]!.name).toBe('Share as post');
  });

  it('adaptForApp uses fallback label for unknown apps', () => {
    const baseTool = createMockTool({
      id: 'share',
      name: 'Share',
      description: 'Share this resource',
    });

    const adapted = adapter.adaptForApp(baseTool, 'quantnew');
    expect(adapted.name).toBe('Share in quantnew');
    expect(adapted.description).toContain('in quantnew');
  });
});
