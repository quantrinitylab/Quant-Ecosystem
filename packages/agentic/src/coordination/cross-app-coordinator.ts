import { QuantOrchestrator } from '../orchestrator/orchestrator.js';
import { unifiedMemory } from '../memory/unified-memory.js';

export class CrossAppCoordinator {
  private orchestrator: QuantOrchestrator;

  constructor(orchestrator: QuantOrchestrator) {
    this.orchestrator = orchestrator;
  }

  async coordinateTask(userId: string, task: string, requiredAgents: string[]): Promise<any> {
    // Store the task in unified memory
    await unifiedMemory.storeForUser(userId, {
      type: 'workflow',
      content: { task, requiredAgents },
    });

    // Run agents in sequence or parallel based on task
    const results = await Promise.all(
      requiredAgents.map((agentId) =>
        this.orchestrator
          .runAgent(agentId, task, { userId })
          .catch((err) => ({ error: err.message, agentId })),
      ),
    );

    // Store results
    await unifiedMemory.storeForUser(userId, {
      type: 'workflow_result',
      content: { task, results },
    });

    return {
      task,
      agentsUsed: requiredAgents,
      results,
      completedAt: new Date(),
    };
  }

  async suggestNextActions(_userId: string): Promise<string[]> {
    // Simple suggestion logic (can be replaced with LLM)
    return [
      'Check your unread emails',
      'Review pending tasks from yesterday',
      'Join trending discussions in your communities',
    ];
  }
}
