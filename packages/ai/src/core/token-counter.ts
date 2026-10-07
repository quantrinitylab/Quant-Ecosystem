// ============================================================================
// AI Core - Token Counter
// ============================================================================

import type { AIModelConfig, ConversationMessage } from '../types';

export interface TokenCountResult {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  withinLimit: boolean;
}

export class TokenCounter {
  countText(text: string): number {
    if (!text) return 0;
    const words = text.split(/\s+/).filter(Boolean);
    const charCount = text.length;
    const wordEstimate = Math.ceil(words.length * 1.3);
    const charEstimate = Math.ceil(charCount / 4);
    return Math.max(wordEstimate, charEstimate);
  }

  countMessages(messages: ConversationMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.countText(msg.content);
      total += 4;
    }
    return total;
  }

  countWithContext(
    systemPrompt: string | undefined,
    messages: ConversationMessage[],
    userPrompt: string,
  ): number {
    let total = 0;
    if (systemPrompt) {
      total += this.countText(systemPrompt) + 4;
    }
    total += this.countMessages(messages);
    total += this.countText(userPrompt) + 4;
    total += 3;
    return total;
  }

  estimateCost(promptTokens: number, completionTokens: number, model: AIModelConfig): number {
    return promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken;
  }

  checkWithinLimit(
    tokenCount: number,
    model: AIModelConfig,
    reservedForOutput: number = 1024,
  ): boolean {
    return tokenCount + reservedForOutput <= model.maxContextLength;
  }

  calculateUsage(
    promptText: string,
    completionText: string,
    model: AIModelConfig,
  ): TokenCountResult {
    const promptTokens = this.countText(promptText);
    const completionTokens = this.countText(completionText);
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = this.estimateCost(promptTokens, completionTokens, model);
    const withinLimit = this.checkWithinLimit(promptTokens, model);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      withinLimit,
    };
  }

  truncateToContext(messages: ConversationMessage[], maxTokens: number): ConversationMessage[] {
    const result: ConversationMessage[] = [];
    let tokenCount = 0;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!;
      const msgTokens = this.countText(msg.content) + 4;
      if (tokenCount + msgTokens > maxTokens) break;
      result.unshift(msg);
      tokenCount += msgTokens;
    }

    return result;
  }
}
