import { EventEmitter } from 'events';
import { MemoryStore } from '../memory/memory-store.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Plan, PlanStep } from '../planning/planner.js';

export class Executor extends EventEmitter {
  private memory: MemoryStore;
  private tools: ToolRegistry;

  constructor(memory: MemoryStore, tools: ToolRegistry) {
    super();
    this.memory = memory;
    this.tools = tools;
  }

  async execute(plan: Plan): Promise<any> {
    const results: any[] = [];

    for (const step of plan.steps) {
      try {
        this.emit('task:started', step);

        const result = await this.executeStep(step);
        results.push(result);

        this.emit('task:completed', { step, result });

        // Store intermediate result in memory
        await this.memory.store({
          type: 'task_result',
          content: { step, result },
        });
      } catch (error) {
        this.emit('task:failed', step, error);
        throw error;
      }
    }

    return {
      planId: plan.id,
      results,
      completedAt: new Date(),
    };
  }

  private async executeStep(step: PlanStep): Promise<any> {
    if (step.tool && this.tools.has(step.tool)) {
      const tool = this.tools.get(step.tool)!;
      return await tool.execute(step.parameters || {});
    }

    // Default execution if no tool specified
    return {
      action: step.action,
      status: 'completed',
      result: `Executed: ${step.description}`,
    };
  }
}
