import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IntelligentAgent } from '../intelligent-agent.js';
import type { IntelligentAgentConfig } from '../intelligent-agent.js';
import type { AIEnginePort } from '../ai-engine.interface.js';
import { TypedToolRegistry } from '../typed-tool-registry.js';
import { SpendingLimit } from '../spending-limit.js';
import { ApprovalQueue } from '../approval-queue.js';
import { PermissionLevel } from '../permissions.js';
import { AgentState } from '../state-machine.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

// ============================================================================
// Test concrete subclass
// ============================================================================

class TestIntelligentAgent extends IntelligentAgent {
  protected getAgentTools(): ToolDefinition[] {
    return this.toolRegistry.getAllTools();
  }

  protected getSystemPrompt(): string {
    return 'You are a test agent. Execute tasks using available tools.';
  }

  // Expose for testing
  public callCheckIdleTimeout(): void {
    this.checkIdleTimeout();
  }
}

// ============================================================================
// Mock AI Engine
// ============================================================================

function createMockAIEngine(overrides?: Partial<AIEnginePort>): AIEnginePort {
  return {
    infer: vi.fn().mockResolvedValue({
      content: JSON.stringify([
        { toolName: 'readFile', args: { path: '/test' }, description: 'Read a file' },
      ]),
      usage: { tokens: 100, cost: 0.002 },
    }),
    classify: vi.fn().mockResolvedValue({ category: 'safe', confidence: 0.95 }),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  };
}

// ============================================================================
// Test helpers
// ============================================================================

function createReadOnlyTool(): ToolDefinition {
  return {
    name: 'readFile',
    description: 'Read a file from disk',
    parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }],
    requiredTier: AgentActionTier.Tier0_ReadOnly,
    category: 'filesystem',
    handler: vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'file contents' },
      undoable: false,
    } as ToolExecutionResult),
  };
}

function createHighRiskTool(): ToolDefinition {
  return {
    name: 'deleteFile',
    description: 'Delete a file from disk',
    parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }],
    requiredTier: AgentActionTier.Tier3_HighRisk,
    category: 'filesystem',
    handler: vi.fn().mockResolvedValue({
      success: true,
      data: null,
      undoable: true,
    } as ToolExecutionResult),
  };
}

function createTestAgent(opts?: {
  aiEngine?: AIEnginePort;
  toolRegistry?: TypedToolRegistry;
  spendingLimit?: SpendingLimit;
  approvalQueue?: ApprovalQueue;
}): TestIntelligentAgent {
  const toolRegistry = opts?.toolRegistry ?? new TypedToolRegistry();
  const spendingLimit =
    opts?.spendingLimit ?? new SpendingLimit({ dailyCap: 10, weeklyCap: 50, monthlyCap: 200 });
  const aiEngine = opts?.aiEngine ?? createMockAIEngine();
  const approvalQueue = opts?.approvalQueue ?? new ApprovalQueue();

  const config: IntelligentAgentConfig = {
    id: 'test-agent-1',
    name: 'Test Agent',
    icon: '🤖',
    defaultPermission: PermissionLevel.FULL_AUTO,
    aiEngine,
    toolRegistry,
    spendingLimit,
    approvalQueue,
  };

  return new TestIntelligentAgent(config);
}

// ============================================================================
// Tests
// ============================================================================

describe('IntelligentAgent', () => {
  let toolRegistry: TypedToolRegistry;
  let spendingLimit: SpendingLimit;
  let approvalQueue: ApprovalQueue;
  let aiEngine: AIEnginePort;

  beforeEach(() => {
    vi.useFakeTimers();
    toolRegistry = new TypedToolRegistry();
    spendingLimit = new SpendingLimit({ dailyCap: 10, weeklyCap: 50, monthlyCap: 200 });
    approvalQueue = new ApprovalQueue();
    aiEngine = createMockAIEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('full planning loop', () => {
    it('produces correct trace with all phases', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const agent = createTestAgent({ aiEngine, toolRegistry, spendingLimit, approvalQueue });
      agent.start();

      await agent.execute({ id: 'task-1', description: 'Read the config file' });

      const trace = agent.getReasoningTrace();

      // Verify all 6 phases are in trace
      const phases = trace.map((t) => t.phase);
      expect(phases).toContain('observe');
      expect(phases).toContain('plan');
      expect(phases).toContain('propose-actions');
      expect(phases).toContain('request-permission');
      expect(phases).toContain('execute');
      expect(phases).toContain('reflect');

      // Verify each trace event has required fields
      for (const event of trace) {
        expect(event).toHaveProperty('phase');
        expect(event).toHaveProperty('input');
        expect(event).toHaveProperty('output');
        expect(event).toHaveProperty('durationMs');
        expect(event).toHaveProperty('tokenCost');
        expect(typeof event.durationMs).toBe('number');
        expect(typeof event.tokenCost).toBe('number');
      }

      // Verify AI engine was called (plan + reflect)
      expect(aiEngine.infer).toHaveBeenCalledTimes(2);

      // Verify tool was executed
      expect(readTool.handler).toHaveBeenCalled();
    });

    it('calls AI engine via injected interface, not direct import', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const mockInfer = vi.fn().mockResolvedValue({
        content: JSON.stringify([
          { toolName: 'readFile', args: { path: '/x' }, description: 'Read' },
        ]),
        usage: { tokens: 50, cost: 0.001 },
      });
      const customEngine: AIEnginePort = {
        infer: mockInfer,
        classify: vi.fn().mockResolvedValue({ category: 'safe', confidence: 1 }),
        embed: vi.fn().mockResolvedValue([]),
      };

      const agent = createTestAgent({
        aiEngine: customEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-2', description: 'Test DI' });

      expect(mockInfer).toHaveBeenCalled();
      // Verify system prompt is passed
      const firstCall = mockInfer.mock.calls[0];
      expect(firstCall?.[1]).toBe('You are a test agent. Execute tasks using available tools.');
    });
  });

  describe('spending limit enforcement', () => {
    it('blocks execution when budget exceeded', async () => {
      // Create a tool with high tier (costs 0.1 per step)
      const expensiveTool: ToolDefinition = {
        name: 'expensiveAction',
        description: 'Costs money',
        parameters: [],
        requiredTier: AgentActionTier.Tier3_HighRisk,
        category: 'expensive',
        handler: vi.fn().mockResolvedValue({ success: true, undoable: false }),
      };
      toolRegistry.registerTool(expensiveTool);

      // Very tight spending limit
      const tightLimit = new SpendingLimit({
        dailyCap: 0.01,
        weeklyCap: 0.05,
        monthlyCap: 0.1,
      });

      // AI returns plan with the expensive tool
      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'expensiveAction', args: {}, description: 'Do expensive thing' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      // Pre-approve all queued items so permission phase passes
      const autoApproveQueue = new ApprovalQueue();
      const originalSubmit = autoApproveQueue.submit.bind(autoApproveQueue);
      vi.spyOn(autoApproveQueue, 'submit').mockImplementation((req) => {
        originalSubmit(req);
        autoApproveQueue.approve(req.id);
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit: tightLimit,
        approvalQueue: autoApproveQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-budget', description: 'Do expensive action' });

      // Tool should NOT have been called because budget was exceeded
      expect(expensiveTool.handler).not.toHaveBeenCalled();
    });
  });

  describe('approval queue gates high-risk actions', () => {
    it('gates actions with tier >= Tier2_LowRisk', async () => {
      const highRiskTool = createHighRiskTool();
      toolRegistry.registerTool(highRiskTool);

      // AI returns plan with high-risk tool
      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'deleteFile', args: { path: '/tmp/x' }, description: 'Delete file' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-hr', description: 'Delete the file' });

      // Approval was submitted
      const pending = approvalQueue.getAll();
      expect(pending.length).toBeGreaterThan(0);

      // Since approvals are not auto-approved, agent should have failed
      // (the request-permission phase returns false when approvals are pending)
      expect(highRiskTool.handler).not.toHaveBeenCalled();
    });

    it('executes when approvals are granted', async () => {
      const highRiskTool = createHighRiskTool();
      toolRegistry.registerTool(highRiskTool);

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'deleteFile', args: { path: '/tmp/x' }, description: 'Delete file' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      // Auto-approve everything
      const autoApproveQueue = new ApprovalQueue();
      const originalSubmit = autoApproveQueue.submit.bind(autoApproveQueue);
      vi.spyOn(autoApproveQueue, 'submit').mockImplementation((req) => {
        originalSubmit(req);
        autoApproveQueue.approve(req.id);
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue: autoApproveQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-approved', description: 'Delete the file' });

      // Tool should have been called because approval was granted
      expect(highRiskTool.handler).toHaveBeenCalled();
    });
  });

  describe('redoWithFeedback', () => {
    it('re-plans with user feedback injected', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const inferMock = vi
        .fn()
        .mockResolvedValueOnce({
          content: JSON.stringify([
            { toolName: 'readFile', args: { path: '/a' }, description: 'Read A' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        })
        .mockResolvedValueOnce({
          content: 'Quality looks good.',
          usage: { tokens: 30, cost: 0.0005 },
        })
        .mockResolvedValueOnce({
          content: JSON.stringify([
            { toolName: 'readFile', args: { path: '/b' }, description: 'Read B instead' },
          ]),
          usage: { tokens: 60, cost: 0.0015 },
        });

      const mockEngine: AIEnginePort = {
        infer: inferMock,
        classify: vi.fn().mockResolvedValue({ category: 'safe', confidence: 1 }),
        embed: vi.fn().mockResolvedValue([]),
      };

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-redo', description: 'Read config' });

      // Now redo with feedback
      await agent.redoWithFeedback('Please read file B instead of A');

      const trace = agent.getReasoningTrace();
      const redoEvent = trace.find((t) => t.phase === 'redo-with-feedback');
      expect(redoEvent).toBeDefined();
      expect(redoEvent!.input).toHaveProperty('feedback', 'Please read file B instead of A');

      // Verify AI was called with feedback
      const lastInferCall = inferMock.mock.calls[2];
      expect(lastInferCall?.[0]).toContain('Please read file B instead of A');
    });
  });

  describe('idle timeout auto-parks agent', () => {
    it('auto-transitions to IDLE after 24h in WAITING_APPROVAL', async () => {
      const highRiskTool = createHighRiskTool();
      toolRegistry.registerTool(highRiskTool);

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'deleteFile', args: { path: '/x' }, description: 'Delete' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-timeout', description: 'Delete file' });

      // Agent should be in FAILED state (approval not granted)
      // But let's test the timeout mechanism directly
      // Reset state for direct timeout test
      await agent.stop();

      // Start fresh and manually put agent in WAITING_APPROVAL
      agent.start();
      agent.stateMachine.transition(AgentState.EXECUTING);
      agent.stateMachine.transition(AgentState.WAITING_APPROVAL);

      // Simulate 24h passing
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      // Force check
      agent.callCheckIdleTimeout();

      // Agent should have transitioned to IDLE
      expect(agent.stateMachine.getState()).toBe(AgentState.IDLE);
    });

    it('does not auto-park before 24h', async () => {
      const agent = createTestAgent({ aiEngine, toolRegistry, spendingLimit, approvalQueue });
      agent.start();
      agent.stateMachine.transition(AgentState.EXECUTING);
      agent.stateMachine.transition(AgentState.WAITING_APPROVAL);

      // Only 12h have passed
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);
      agent.callCheckIdleTimeout();

      expect(agent.stateMachine.getState()).toBe(AgentState.WAITING_APPROVAL);
    });
  });

  describe('cost preview', () => {
    it('matches plan estimate', async () => {
      const readTool = createReadOnlyTool();
      const highRiskTool = createHighRiskTool();
      toolRegistry.registerTool(readTool);
      toolRegistry.registerTool(highRiskTool);

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'readFile', args: { path: '/a' }, description: 'Read' },
            { toolName: 'deleteFile', args: { path: '/b' }, description: 'Delete' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      // Auto-approve so plan proceeds far enough to compute cost
      const autoApproveQueue = new ApprovalQueue();
      const originalSubmit = autoApproveQueue.submit.bind(autoApproveQueue);
      vi.spyOn(autoApproveQueue, 'submit').mockImplementation((req) => {
        originalSubmit(req);
        autoApproveQueue.approve(req.id);
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue: autoApproveQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-cost', description: 'Read and delete' });

      const costPreview = agent.getCostPreview();
      // readFile = Tier0 = $0, deleteFile = Tier3 = $0.10
      expect(costPreview.totalEstimatedCost).toBeCloseTo(0.1, 2);
      expect(costPreview.breakdown).toHaveLength(2);
      expect(costPreview.currency).toBe('USD');
    });

    it('returns zero estimate when no plan exists', () => {
      const agent = createTestAgent({ aiEngine, toolRegistry, spendingLimit, approvalQueue });
      const cost = agent.getCostPreview();
      expect(cost.totalEstimatedCost).toBe(0);
      expect(cost.breakdown).toHaveLength(0);
    });
  });

  describe('getReasoningTrace', () => {
    it('returns populated trace after execution', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const agent = createTestAgent({ aiEngine, toolRegistry, spendingLimit, approvalQueue });
      agent.start();

      await agent.execute({ id: 'task-trace', description: 'Test trace' });

      const trace = agent.getReasoningTrace();
      expect(trace.length).toBeGreaterThan(0);

      // Verify trace events have token costs for AI-involved phases
      const planEvent = trace.find((t) => t.phase === 'plan');
      expect(planEvent).toBeDefined();
      expect(planEvent!.tokenCost).toBeGreaterThan(0);
    });

    it('returns empty array before execution', () => {
      const agent = createTestAgent({ aiEngine, toolRegistry, spendingLimit, approvalQueue });
      expect(agent.getReasoningTrace()).toEqual([]);
    });
  });

  describe('plan parsing failure safety', () => {
    it('transitions to FAILED with empty plan when AI returns non-JSON', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: 'Sorry, I cannot help with that request.',
          usage: { tokens: 20, cost: 0.001 },
        }),
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-garbled', description: 'Do something' });

      // Agent should be in FAILED state
      expect(agent.stateMachine.getState()).toBe(AgentState.FAILED);

      // Tool should NOT have been called (no all-tools fallback)
      expect(readTool.handler).not.toHaveBeenCalled();

      // Trace should contain error info
      const trace = agent.getReasoningTrace();
      const planEvent = trace.find((t) => t.phase === 'plan');
      expect(planEvent).toBeDefined();
      expect(planEvent!.output).toHaveProperty('error');
    });

    it('transitions to FAILED when AI returns malformed JSON', async () => {
      const readTool = createReadOnlyTool();
      toolRegistry.registerTool(readTool);

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: '[{invalid json',
          usage: { tokens: 20, cost: 0.001 },
        }),
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit,
        approvalQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-malformed', description: 'Do something' });

      expect(agent.stateMachine.getState()).toBe(AgentState.FAILED);
      expect(readTool.handler).not.toHaveBeenCalled();
    });
  });

  describe('per-step budget enforcement', () => {
    it('skips remaining steps when budget is exceeded mid-execution', async () => {
      const tool1: ToolDefinition = {
        name: 'step1',
        description: 'First step',
        parameters: [],
        requiredTier: AgentActionTier.Tier2_LowRisk,
        category: 'test',
        handler: vi.fn().mockResolvedValue({ success: true, data: null, undoable: false }),
      };
      const tool2: ToolDefinition = {
        name: 'step2',
        description: 'Second step',
        parameters: [],
        requiredTier: AgentActionTier.Tier2_LowRisk,
        category: 'test',
        handler: vi.fn().mockResolvedValue({ success: true, data: null, undoable: false }),
      };
      toolRegistry.registerTool(tool1);
      toolRegistry.registerTool(tool2);

      // Use spy to simulate budget exhaustion mid-execution
      const tightLimit = new SpendingLimit({
        dailyCap: 0.1,
        weeklyCap: 50,
        monthlyCap: 200,
      });
      const canSpendSpy = vi.spyOn(tightLimit, 'canSpend');
      canSpendSpy
        .mockReturnValueOnce(true) // pre-execution aggregate check passes
        .mockReturnValueOnce(true) // step1 per-step check passes
        .mockReturnValueOnce(false); // step2 per-step check fails

      const mockEngine = createMockAIEngine({
        infer: vi.fn().mockResolvedValue({
          content: JSON.stringify([
            { toolName: 'step1', args: {}, description: 'First' },
            { toolName: 'step2', args: {}, description: 'Second' },
          ]),
          usage: { tokens: 50, cost: 0.001 },
        }),
      });

      // Auto-approve
      const autoApproveQueue = new ApprovalQueue();
      const originalSubmit = autoApproveQueue.submit.bind(autoApproveQueue);
      vi.spyOn(autoApproveQueue, 'submit').mockImplementation((req) => {
        originalSubmit(req);
        autoApproveQueue.approve(req.id);
      });

      const agent = createTestAgent({
        aiEngine: mockEngine,
        toolRegistry,
        spendingLimit: tightLimit,
        approvalQueue: autoApproveQueue,
      });
      agent.start();

      await agent.execute({ id: 'task-budget-mid', description: 'Two steps' });

      // First step should have run
      expect(tool1.handler).toHaveBeenCalled();
      // Second step should NOT have run (budget exhausted)
      expect(tool2.handler).not.toHaveBeenCalled();
    });
  });
});
