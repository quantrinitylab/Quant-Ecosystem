// ============================================================================
// QuantAI - Assistant Service
// Core AI assistant with memory, context, personality, and tool calling
// ============================================================================

import type { Assistant, Conversation, ConversationMessage, ConversationMemory, MemoryEntry, AssistantTool, ToolCall, ToolResult, AssistantPersonality } from '../../src/types';

export class AssistantService {
  private conversations: Map<string, Conversation> = new Map();
  private assistants: Map<string, Assistant> = new Map();
  private userMemory: Map<string, ConversationMemory> = new Map();

  private tools: AssistantTool[] = [
    { id: 'tool_search', name: 'web_search', description: 'Search the web for information', parameters: [{ name: 'query', type: 'string', description: 'Search query', required: true }], handler: 'search', category: 'information', requiresConfirmation: false },
    { id: 'tool_send_email', name: 'send_email', description: 'Send an email via QuantMail', parameters: [{ name: 'to', type: 'string', description: 'Recipient', required: true }, { name: 'subject', type: 'string', description: 'Subject', required: true }, { name: 'body', type: 'string', description: 'Body', required: true }], handler: 'email', category: 'communication', requiresConfirmation: true },
    { id: 'tool_create_post', name: 'create_post', description: 'Create a post on QuantSync', parameters: [{ name: 'content', type: 'string', description: 'Post content', required: true }], handler: 'social', category: 'social', requiresConfirmation: true },
    { id: 'tool_edit_image', name: 'edit_image', description: 'Edit an image using QuantEdits', parameters: [{ name: 'imageUrl', type: 'string', description: 'Image URL', required: true }, { name: 'action', type: 'string', description: 'Editing action', required: true }], handler: 'editor', category: 'creative', requiresConfirmation: false },
    { id: 'tool_calendar', name: 'manage_calendar', description: 'Manage calendar events', parameters: [{ name: 'action', type: 'string', description: 'Action (create/list/update/delete)', required: true }], handler: 'calendar', category: 'productivity', requiresConfirmation: true },
    { id: 'tool_device', name: 'control_device', description: 'Control connected device', parameters: [{ name: 'deviceId', type: 'string', description: 'Device ID', required: true }, { name: 'command', type: 'string', description: 'Command to execute', required: true }], handler: 'device', category: 'device', requiresConfirmation: true },
  ];

  getOrCreateAssistant(userId: string): Assistant {
    let assistant = this.assistants.get(userId);
    if (!assistant) {
      assistant = {
        id: `asst_${userId}`,
        name: 'QuantAI Assistant',
        personality: this.getDefaultPersonality(),
        capabilities: ['text', 'vision', 'code', 'function-calling', 'reasoning'],
        memory: this.getOrCreateMemory(userId),
        tools: this.tools,
        activeModel: 'quant-pro-v2',
        contextWindow: 128000,
        maxTokens: 4096,
      };
      this.assistants.set(userId, assistant);
    }
    return assistant;
  }

  private getDefaultPersonality(): AssistantPersonality {
    return {
      name: 'QuantAI',
      tone: 'friendly',
      traits: ['helpful', 'knowledgeable', 'proactive', 'concise'],
      systemPrompt: 'You are QuantAI, a powerful AI assistant integrated across the Quant ecosystem. Help users with any task across all Quant apps.',
      greeting: "Hi! I'm your QuantAI assistant. I can help with emails, social posts, video editing, device control, and much more. What can I do for you?",
    };
  }

  private getOrCreateMemory(userId: string): ConversationMemory {
    let memory = this.userMemory.get(userId);
    if (!memory) {
      memory = { shortTerm: [], longTerm: [], maxShortTerm: 20, maxLongTerm: 100 };
      this.userMemory.set(userId, memory);
    }
    return memory;
  }

  async chat(userId: string, conversationId: string | null, message: string, attachments?: any[]): Promise<{ conversation: Conversation; response: ConversationMessage }> {
    const assistant = this.getOrCreateAssistant(userId);
    let conversation: Conversation;

    if (conversationId && this.conversations.has(conversationId)) {
      conversation = this.conversations.get(conversationId)!;
    } else {
      conversation = this.createConversation(userId, assistant.id);
    }

    // Add user message
    const userMessage: ConversationMessage = {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: message,
      attachments,
      metadata: { model: '', tokens: 0, latency: 0 },
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);

    // Process message and generate response
    const startTime = Date.now();
    const toolCalls = this.detectToolCalls(message);
    const toolResults = await this.executeTools(toolCalls);
    const responseContent = this.generateResponse(message, assistant, conversation, toolResults);
    const latency = Date.now() - startTime;

    const assistantMessage: ConversationMessage = {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      role: 'assistant',
      content: responseContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      metadata: { model: assistant.activeModel, tokens: Math.ceil(responseContent.length / 4), latency },
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(assistantMessage);

    // Update memory
    this.updateMemory(userId, message, responseContent);
    conversation.updatedAt = new Date().toISOString();
    if (!conversation.title || conversation.title === 'New Conversation') {
      conversation.title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
    }

    return { conversation, response: assistantMessage };
  }

  private createConversation(userId: string, assistantId: string): Conversation {
    const conversation: Conversation = {
      id: `conv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      userId,
      assistantId,
      messages: [],
      context: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: 'New Conversation',
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  private detectToolCalls(message: string): ToolCall[] {
    const calls: ToolCall[] = [];
    const lower = message.toLowerCase();

    if (lower.includes('send email') || lower.includes('email')) {
      calls.push({ id: `call_${Date.now().toString(36)}`, toolId: 'tool_send_email', name: 'send_email', arguments: { to: '', subject: '', body: message }, status: 'pending' });
    }
    if (lower.includes('search for') || lower.includes('look up') || lower.includes('find info')) {
      calls.push({ id: `call_${Date.now().toString(36)}`, toolId: 'tool_search', name: 'web_search', arguments: { query: message }, status: 'pending' });
    }
    if (lower.includes('post') && (lower.includes('sync') || lower.includes('social'))) {
      calls.push({ id: `call_${Date.now().toString(36)}`, toolId: 'tool_create_post', name: 'create_post', arguments: { content: message }, status: 'pending' });
    }
    if (lower.includes('edit') && (lower.includes('image') || lower.includes('photo'))) {
      calls.push({ id: `call_${Date.now().toString(36)}`, toolId: 'tool_edit_image', name: 'edit_image', arguments: { imageUrl: '', action: message }, status: 'pending' });
    }
    if (lower.includes('device') || lower.includes('phone') || lower.includes('laptop')) {
      calls.push({ id: `call_${Date.now().toString(36)}`, toolId: 'tool_device', name: 'control_device', arguments: { deviceId: '', command: message }, status: 'pending' });
    }

    return calls;
  }

  private async executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      const start = Date.now();
      call.status = 'running';
      // Simulate tool execution
      await new Promise(resolve => setTimeout(resolve, 50));
      call.status = 'completed';
      results.push({ callId: call.id, output: { success: true, message: `Executed ${call.name}` }, duration: Date.now() - start });
    }
    return results;
  }

  private generateResponse(message: string, assistant: Assistant, conversation: Conversation, toolResults: ToolResult[]): string {
    const memory = assistant.memory;
    const relevantMemory = memory.longTerm.filter(m => message.toLowerCase().includes(m.content.toLowerCase().substring(0, 20))).slice(0, 3);

    if (toolResults.length > 0) {
      return `I've processed your request. ${toolResults.map(r => `Tool ${r.callId} completed in ${r.duration}ms.`).join(' ')} Is there anything else I can help with?`;
    }

    // Context-aware response generation
    if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
      return assistant.personality.greeting;
    }

    return `I understand you'd like help with: "${message.substring(0, 100)}". Based on my capabilities across the Quant ecosystem, I can assist you with this. Would you like me to proceed?`;
  }

  private updateMemory(userId: string, userMessage: string, response: string): void {
    const memory = this.getOrCreateMemory(userId);

    // Add to short-term memory
    const entry: MemoryEntry = {
      id: `mem_${Date.now().toString(36)}`,
      content: userMessage.substring(0, 200),
      type: 'context',
      importance: 0.5,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 1,
    };
    memory.shortTerm.push(entry);

    // Promote high-importance items to long-term
    if (memory.shortTerm.length > memory.maxShortTerm) {
      const promoted = memory.shortTerm.shift()!;
      if (promoted.importance > 0.7) {
        memory.longTerm.push(promoted);
        if (memory.longTerm.length > memory.maxLongTerm) memory.longTerm.shift();
      }
    }
  }

  getConversation(conversationId: string): Conversation | null {
    return this.conversations.get(conversationId) || null;
  }

  listConversations(userId: string): Conversation[] {
    return Array.from(this.conversations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId);
  }

  getAvailableTools(): AssistantTool[] {
    return this.tools;
  }

  updatePersonality(userId: string, personality: Partial<AssistantPersonality>): Assistant {
    const assistant = this.getOrCreateAssistant(userId);
    Object.assign(assistant.personality, personality);
    return assistant;
  }
}

export const assistantService = new AssistantService();
