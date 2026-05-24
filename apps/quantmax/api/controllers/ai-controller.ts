// ============================================================================
// QuantMax - AI Controller
// ============================================================================

import { aiService } from '../services/ai-service';
import type { UserProfile, Message } from '../../src/types';

export class AIController {
  generateStarters(user: UserProfile, match: UserProfile) { return aiService.generateConversationStarters(user, match); }
  analyzeCompatibility(user: UserProfile, target: UserProfile) { return aiService.analyzeCompatibility(user, target); }
  moderateMessage(message: string) { return aiService.moderateMessage(message); }
  detectCatfish(messages: Message[], userId: string) { return aiService.detectCatfishBehavior(messages, userId); }
  getProfileTips(profile: UserProfile) { return aiService.suggestMatchBoost(profile); }
}

export const aiController = new AIController();
