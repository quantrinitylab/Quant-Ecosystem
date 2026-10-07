import { EventEmitter } from 'events';
import { QuantOrchestrator } from '../orchestrator/orchestrator.js';

export interface Message {
  from: string;
  to: string;
  content: any;
  type: 'request' | 'response' | 'notification';
  timestamp: Date;
}

export class AgentCommunicationBus extends EventEmitter {
  private orchestrator: QuantOrchestrator;
  private messageHistory: Message[] = [];

  constructor(orchestrator: QuantOrchestrator) {
    super();
    this.orchestrator = orchestrator;
  }

  async sendMessage(
    from: string,
    to: string,
    content: any,
    type: 'request' | 'response' | 'notification' = 'request',
  ): Promise<any> {
    const message: Message = {
      from,
      to,
      content,
      type,
      timestamp: new Date(),
    };

    this.messageHistory.push(message);
    this.emit('message:sent', message);

    // If it's a request, execute on target agent
    if (type === 'request') {
      try {
        const result = await this.orchestrator.runAgent(to, JSON.stringify(content), {
          fromAgent: from,
          messageType: 'agent_communication',
        });

        // Send response back
        await this.sendMessage(to, from, result, 'response');

        return result;
      } catch (error) {
        this.emit('message:failed', { message, error });
        throw error;
      }
    }

    return { success: true };
  }

  getMessageHistory(agentId?: string): Message[] {
    if (agentId) {
      return this.messageHistory.filter((m) => m.from === agentId || m.to === agentId);
    }
    return this.messageHistory;
  }

  async broadcast(from: string, content: any): Promise<void> {
    const agents = this.orchestrator.getActiveAgents();

    for (const agentId of agents) {
      if (agentId !== from) {
        await this.sendMessage(from, agentId, content, 'notification');
      }
    }
  }
}
