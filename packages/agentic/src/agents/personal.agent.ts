import { Agent } from '../core/agent.js';
import { unifiedMemory } from '../memory/unified-memory.js';

export class PersonalAgent extends Agent {
  private userId: string;

  constructor(userId: string, userName: string) {
    super({
      id: `personal-${userId}`,
      name: `${userName}'s Personal Agent`,
      personality: `Helpful, proactive, and deeply familiar with ${userName}'s preferences and workflows`,
      capabilities: [
        'personal_assistance',
        'task_automation',
        'cross_app_coordination',
        'proactive_suggestions',
        'memory_management',
        'workflow_creation',
      ],
    });

    this.userId = userId;
    this.registerPersonalTools();
  }

  private registerPersonalTools() {
    this.addTool({
      name: 'personal_remind',
      description: 'Set a personal reminder',
      parameters: {
        message: 'string',
        time: 'string',
      },
      execute: async (params: any) => {
        await unifiedMemory.storeForUser(this.userId, {
          type: 'task',
          content: params,
          sourceAgent: this.id,
        });
        return { success: true, reminderSet: true };
      },
    });

    this.addTool({
      name: 'personal_suggest',
      description: 'Get personalized suggestions',
      parameters: {},
      execute: async () => {
        return {
          suggestions: [
            'You have 3 unread emails from yesterday',
            'Your team meeting starts in 30 minutes',
            'Trending in your communities: AI Agents',
          ],
        };
      },
    });
  }

  async getUserContext() {
    return unifiedMemory.getUserContext(this.userId);
  }
}
