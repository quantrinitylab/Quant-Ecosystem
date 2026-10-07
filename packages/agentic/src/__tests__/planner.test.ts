import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner, LLMProvider } from '../planning/planner.js';
import { MemoryStore } from '../memory/memory-store.js';
import { ToolRegistry } from '../tools/tool-registry.js';

describe('Planner - LLM-powered planning', () => {
  let planner: Planner;
  let mockLLM: LLMProvider;
  let tools: ToolRegistry;
  let memory: MemoryStore;

  beforeEach(() => {
    memory = new MemoryStore('test-agent');
    tools = new ToolRegistry();

    tools.register({
      name: 'quantmail_send',
      description: 'Send an email',
      parameters: { to: 'string', subject: 'string' },
      execute: vi.fn(),
    });
    tools.register({
      name: 'quantchat_send',
      description: 'Send a chat message',
      parameters: { conversationId: 'string', content: 'string' },
      execute: vi.fn(),
    });

    planner = new Planner(memory, tools);

    mockLLM = {
      infer: vi.fn(),
    };
  });

  it('uses LLM provider when available', async () => {
    planner.setLLMProvider(mockLLM);

    (mockLLM.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        steps: [
          {
            id: 'step-1',
            action: 'send_email',
            tool: 'quantmail_send',
            parameters: { to: 'alice@example.com', subject: 'Hi' },
            description: 'Send email to Alice',
          },
        ],
        confidence: 0.95,
      }),
    });

    const plan = await planner.createPlan('Send an email to Alice');

    expect(mockLLM.infer).toHaveBeenCalled();
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.tool).toBe('quantmail_send');
    expect(plan.steps[0]?.parameters?.to).toBe('alice@example.com');
    expect(plan.confidence).toBe(0.95);
  });

  it('falls back to keyword matching when LLM fails', async () => {
    planner.setLLMProvider(mockLLM);

    (mockLLM.infer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API key invalid'));

    const plan = await planner.createPlan('Send an email to Bob');

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.tool).toBe('quantmail_send');
    expect(plan.confidence).toBe(0.85);
  });

  it('uses keyword fallback when no LLM provider set', async () => {
    const plan = await planner.createPlan('Start a chat');

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.tool).toBe('quantchat_send');
  });

  it('creates general response for unmatched goals', async () => {
    const plan = await planner.createPlan('What is the weather?');

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toBe('general_response');
    expect(plan.steps[0]?.tool).toBeUndefined();
  });

  it('LLM plan includes available tools in the prompt', async () => {
    planner.setLLMProvider(mockLLM);

    (mockLLM.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({ steps: [], confidence: 0.5 }),
    });

    await planner.createPlan('Do something');

    const call = (mockLLM.infer as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.systemPrompt).toContain('quantmail_send');
    expect(call.systemPrompt).toContain('quantchat_send');
  });

  it('refinePlan uses LLM when available', async () => {
    planner.setLLMProvider(mockLLM);

    const originalPlan = {
      id: 'plan-1',
      goal: 'send email',
      steps: [{ id: 'step-1', action: 'send', tool: 'quantmail_send', description: 'send' }],
      confidence: 0.7,
    };

    (mockLLM.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        steps: [
          { id: 'step-1', action: 'draft', tool: 'quantmail_send', description: 'Draft then send' },
          { id: 'step-2', action: 'confirm', description: 'Confirm delivery' },
        ],
        confidence: 0.9,
      }),
    });

    const refined = await planner.refinePlan(originalPlan, 'Also confirm delivery');

    expect(refined.steps).toHaveLength(2);
    expect(refined.confidence).toBe(0.9);
  });

  it('keyword planner handles meet/video keywords', async () => {
    const plan = await planner.createPlan('Create a video room for the team');
    expect(plan.steps[0]?.tool).toBe('quantmeet_create_room');
  });

  it('keyword planner handles file/upload/drive keywords', async () => {
    const plan = await planner.createPlan('Upload the report to drive');
    expect(plan.steps[0]?.tool).toBe('quantdrive_upload');
  });

  it('keyword planner handles post/social keywords', async () => {
    const plan = await planner.createPlan('Create a social post about our launch');
    expect(plan.steps[0]?.tool).toBe('quantsync_create_post');
  });
});
