import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantChatClient } from '../clients/http-client.js';

export class QuantChatAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantchat-agent',
      name: 'QuantChat Agent',
      personality: 'Friendly, real-time, context-aware messaging assistant',
      capabilities: [
        'send_message',
        'create_group',
        'manage_conversations',
        'smart_replies',
        'message_search',
        'presence_management',
      ],
    });

    this.httpClient = httpClient ?? createQuantChatClient();
    this.registerChatTools();
  }

  private registerChatTools() {
    this.addTool({
      name: 'quantchat_send',
      description: 'Send a message via QuantChat',
      parameters: {
        conversationId: 'string',
        content: 'string',
        type: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantChatAgent] Sending message:', params);

        const response = await this.httpClient.post('/api/messages', {
          conversationId: params.conversationId,
          content: params.content,
          type: params.type || 'text',
        });

        if (!response.ok) {
          logger.warn('[QuantChatAgent] Failed to send message:', response.error);
          return { success: false, error: response.error };
        }

        return {
          success: true,
          messageId: response.data?.id || response.data?.messageId,
          timestamp: response.data?.createdAt || new Date().toISOString(),
        };
      },
    });

    this.addTool({
      name: 'quantchat_smart_reply',
      description: 'Generate smart reply suggestions',
      parameters: {
        conversationId: 'string',
        lastMessage: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantChatAgent] Generating smart replies:', params);

        const response = await this.httpClient.post('/api/ai/smart-replies', {
          conversationId: params.conversationId,
          lastMessage: params.lastMessage,
        });

        if (!response.ok) {
          logger.warn('[QuantChatAgent] Failed to get smart replies:', response.error);
          // Graceful fallback with generic suggestions
          return {
            suggestions: [
              'Sounds good!',
              'Let me check and get back to you.',
              'Thanks for letting me know.',
            ],
          };
        }

        return {
          suggestions: response.data?.suggestions || response.data || [],
        };
      },
    });
  }
}
