// ============================================================================
// QuantMax - AI Service
// AI matching, conversation starters, content moderation, catfish detection
// ============================================================================

import type { UserProfile, Message } from '../../src/types';

interface ConversationSuggestion {
  text: string;
  type: 'opener' | 'follow-up' | 'question' | 'flirty' | 'funny';
  context: string;
}

interface CompatibilityInsight {
  score: number;
  highlights: string[];
  concerns: string[];
  conversationTopics: string[];
}

export class AIService {
  generateConversationStarters(user: UserProfile, match: UserProfile): ConversationSuggestion[] {
    const suggestions: ConversationSuggestion[] = [];
    const sharedInterests = user.interests.filter(i => match.interests.includes(i));

    if (sharedInterests.length > 0) {
      suggestions.push({
        text: `I see you're into ${sharedInterests[0]} too! What got you started?`,
        type: 'opener',
        context: `Shared interest: ${sharedInterests[0]}`,
      });
    }

    if (match.prompts.length > 0) {
      const prompt = match.prompts[0];
      suggestions.push({
        text: `Love your answer to "${prompt.question}" - ${prompt.answer.substring(0, 30)}... tell me more!`,
        type: 'opener',
        context: 'Based on their prompt response',
      });
    }

    if (match.job) {
      suggestions.push({
        text: `${match.job} sounds interesting! What's the best part of your day?`,
        type: 'question',
        context: 'Based on their career',
      });
    }

    suggestions.push(
      { text: "If you could travel anywhere tomorrow, where would you go?", type: 'question', context: 'Universal opener' },
      { text: "What's the most spontaneous thing you've done recently?", type: 'funny', context: 'Lighthearted' },
      { text: "I have a feeling we'd get along. Prove me right?", type: 'flirty', context: 'Playful' },
    );

    return suggestions.slice(0, 5);
  }

  analyzeCompatibility(user: UserProfile, target: UserProfile): CompatibilityInsight {
    const sharedInterests = user.interests.filter(i => target.interests.includes(i));
    const highlights: string[] = [];
    const concerns: string[] = [];
    const topics: string[] = [];
    let score = 50;

    if (sharedInterests.length >= 3) { highlights.push(`${sharedInterests.length} shared interests`); score += 15; }
    else if (sharedInterests.length > 0) { highlights.push(`Common interest in ${sharedInterests[0]}`); score += 8; }

    if (user.relationshipGoal === target.relationshipGoal) { highlights.push('Same relationship goals'); score += 20; }
    else { concerns.push('Different relationship goals'); score -= 10; }

    const ageDiff = Math.abs(user.age - target.age);
    if (ageDiff <= 3) { highlights.push('Similar age'); score += 5; }
    else if (ageDiff > 10) { concerns.push('Significant age difference'); score -= 5; }

    for (const interest of sharedInterests.slice(0, 3)) {
      topics.push(interest);
    }
    topics.push('Travel experiences', 'Favorite restaurants');

    return { score: Math.max(0, Math.min(100, score)), highlights, concerns, conversationTopics: topics };
  }

  moderateMessage(message: string): { safe: boolean; reason?: string } {
    const lower = message.toLowerCase();
    if (/\b(phone|number|address|social\s*security)\b/.test(lower) && /\b(give|send|what's)\b/.test(lower)) {
      return { safe: false, reason: 'Potential personal information solicitation' };
    }
    if (/https?:\/\//i.test(message)) {
      return { safe: false, reason: 'External links not allowed in early conversations' };
    }
    return { safe: true };
  }

  detectCatfishBehavior(messages: Message[], userId: string): { risk: number; indicators: string[] } {
    const indicators: string[] = [];
    let risk = 0;

    const userMessages = messages.filter(m => m.senderId === userId);
    if (userMessages.length === 0) return { risk: 0, indicators: [] };

    // Asks to move off-platform quickly
    const earlyMoveOff = userMessages.slice(0, 5).some(m =>
      /\b(whatsapp|instagram|snap|telegram|signal)\b/i.test(m.content)
    );
    if (earlyMoveOff) { indicators.push('Asks to move off-platform early'); risk += 25; }

    // Refuses to video call
    const refusesVideo = userMessages.some(m =>
      /\b(can't video|no video|camera broken|shy on video)\b/i.test(m.content)
    );
    if (refusesVideo) { indicators.push('Avoids video calls'); risk += 20; }

    // Generic/copy-paste messages
    const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
    if (avgLength > 200) { indicators.push('Unusually long messages (possible copy-paste)'); risk += 15; }

    return { risk: Math.min(risk, 100), indicators };
  }

  suggestMatchBoost(profile: UserProfile): string[] {
    const tips: string[] = [];
    if (!profile.photos || profile.photos.length < 3) tips.push('Add more photos to increase your match rate by 70%');
    if (!profile.bio || profile.bio.length < 50) tips.push('Write a longer bio - profiles with 100+ characters get 30% more matches');
    if (profile.prompts.length < 2) tips.push('Answer more prompts to show your personality');
    if (profile.verified === 'unverified') tips.push('Get verified to appear higher in recommendations');
    return tips;
  }
}

export const aiService = new AIService();
