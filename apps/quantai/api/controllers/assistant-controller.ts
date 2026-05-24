// ============================================================================
// QuantAI - Assistant Controller
// ============================================================================

import { assistantService } from '../services/assistant-service';
import type { AssistantPersonality } from '../../src/types';

export class AssistantController {
  async chat(userId: string, conversationId: string | null, message: string, attachments?: any[]) { return assistantService.chat(userId, conversationId, message, attachments); }
  getConversation(id: string) { return assistantService.getConversation(id); }
  listConversations(userId: string) { return assistantService.listConversations(userId); }
  deleteConversation(id: string) { return assistantService.deleteConversation(id); }
  getTools() { return assistantService.getAvailableTools(); }
  updatePersonality(userId: string, personality: Partial<AssistantPersonality>) { return assistantService.updatePersonality(userId, personality); }
  getAssistant(userId: string) { return assistantService.getOrCreateAssistant(userId); }
}

export const assistantController = new AssistantController();
