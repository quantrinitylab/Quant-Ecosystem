import { EventEmitter } from 'events';
import { QuantOrchestrator } from '../orchestrator/orchestrator.js';
import { IntelligentOrchestrator } from '../orchestrator/intelligent-orchestrator.js';
import { unifiedMemory } from '../memory/unified-memory.js';

export interface WorkflowStep {
  id: string;
  agentId: string;
  action: string;
  parameters?: Record<string, any>;
  dependsOn?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Workflow {
  id: string;
  name: string;
  userId: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, Workflow> = new Map();
  private orchestrator: QuantOrchestrator | IntelligentOrchestrator;

  constructor(orchestrator: QuantOrchestrator | IntelligentOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  async createWorkflow(userId: string, name: string, goal: string): Promise<Workflow> {
    // Use the planner to break down the goal into steps
    const plan = (await (this.orchestrator as any)['planner']?.createPlan(goal)) || {
      steps: [{ action: 'general', description: goal }],
    };

    const steps: WorkflowStep[] = plan.steps.map((step: any, index: number) => ({
      id: `step-${index}`,
      agentId: this.inferAgentFromAction(step.action),
      action: step.action,
      parameters: step.parameters,
      status: 'pending',
    }));

    const workflow: Workflow = {
      id: `workflow-${Date.now()}`,
      name,
      userId,
      steps,
      status: 'pending',
      createdAt: new Date(),
    };

    this.workflows.set(workflow.id, workflow);
    this.emit('workflow:created', workflow);

    return workflow;
  }

  private inferAgentFromAction(action: string): string {
    if (action.includes('email') || action.includes('mail')) return 'quantmail-agent';
    if (action.includes('chat') || action.includes('message')) return 'quantchat-agent';
    if (action.includes('file') || action.includes('upload')) return 'quantdrive-agent';
    return 'quantai-agent';
  }

  async executeWorkflow(workflowId: string): Promise<unknown[]> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');

    workflow.status = 'running';
    this.emit('workflow:started', workflow);

    const results: unknown[] = [];

    for (const step of workflow.steps) {
      try {
        step.status = 'running';
        this.emit('workflow:step_started', step);

        const result = await this.orchestrator.runAgent(step.agentId, step.action, step.parameters);

        step.status = 'completed';
        results.push(result);

        this.emit('workflow:step_completed', { step, result });

        // Store in unified memory
        await unifiedMemory.storeForUser(workflow.userId, {
          type: 'workflow',
          content: { step, result },
          sourceAgent: step.agentId,
        });
      } catch (error) {
        step.status = 'failed';
        this.emit('workflow:step_failed', { step, error });
        throw error;
      }
    }

    workflow.status = 'completed';
    workflow.completedAt = new Date();

    this.emit('workflow:completed', workflow);

    return results;
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  getUserWorkflows(userId: string): Workflow[] {
    return Array.from(this.workflows.values()).filter((w) => w.userId === userId);
  }
}
