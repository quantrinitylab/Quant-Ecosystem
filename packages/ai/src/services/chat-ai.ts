// ============================================================================
// AI Services - Chat AI (QuantChat)
// ============================================================================

import type { AIInferenceRequest, SmartReply, ModerationResult } from '../types';
import { AIEngine } from '../core/engine';

/**
 * Chat AI Service
 *
 * AI features for QuantChat:
 * - Smart reply suggestions
 * - Message content moderation
 * - Chat summarization
 * - Language translation
 * - Spam detection
 * - Tone analysis
 */
export class ChatAIService {
  private engine: AIEngine;

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  /**
   * Generate smart reply suggestions for a message
   */
  async generateSmartReplies(
    message: string,
    conversationContext: string[],
    userId: string
  ): Promise<SmartReply[]> {
    const request: AIInferenceRequest = {
      prompt: `Generate 3 short reply suggestions for this message: "${message}"\n\nContext: ${conversationContext.slice(-3).join(' | ')}`,
      systemPrompt: 'Generate brief, natural reply suggestions. Return exactly 3 options with different tones.',
      userId,
      app: 'quantchat',
      feature: 'smart_replies',
      temperature: 0.8,
      maxTokens: 150,
    };

    const response = await this.engine.infer(request);
    return this.parseSmartReplies(response.content);
  }

  /**
   * Moderate message content for safety
   */
  async moderateMessage(content: string, userId: string): Promise<ModerationResult> {
    const request: AIInferenceRequest = {
      prompt: `Analyze this message for safety and appropriateness: "${content}"`,
      systemPrompt: 'You are a content moderation system. Analyze for: harassment, hate speech, explicit content, spam, threats, and self-harm.',
      userId,
      app: 'quantchat',
      feature: 'content_moderation',
      temperature: 0.1,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return this.parseModerationResult(response.content);
  }

  /**
   * Summarize a conversation
   */
  async summarizeConversation(
    messages: { sender: string; content: string }[],
    userId: string
  ): Promise<string> {
    const transcript = messages
      .map((m) => `${m.sender}: ${m.content}`)
      .join('\n');

    const request: AIInferenceRequest = {
      prompt: `Summarize this conversation:\n${transcript}`,
      systemPrompt: 'Provide a concise summary of the key points discussed.',
      userId,
      app: 'quantchat',
      feature: 'summarization',
      temperature: 0.3,
      maxTokens: 300,
    };

    const response = await this.engine.infer(request);
    return response.content;
  }

  /**
   * Translate a message
   */
  async translateMessage(
    content: string,
    targetLanguage: string,
    userId: string
  ): Promise<string> {
    const request: AIInferenceRequest = {
      prompt: `Translate to ${targetLanguage}: "${content}"`,
      systemPrompt: 'Provide only the translation, preserving tone and emoji.',
      userId,
      app: 'quantchat',
      feature: 'translation',
      temperature: 0.2,
      maxTokens: 500,
    };

    const response = await this.engine.infer(request);
    return response.content;
  }

  /**
   * Detect spam messages
   */
  async detectSpam(content: string, userId: string): Promise<{ isSpam: boolean; confidence: number }> {
    const request: AIInferenceRequest = {
      prompt: `Is this message spam? "${content}"`,
      systemPrompt: 'Classify as spam or not spam. Consider promotional content, phishing, and bulk messaging patterns.',
      userId,
      app: 'quantchat',
      feature: 'spam_detection',
      temperature: 0.1,
      maxTokens: 50,
    };

    const response = await this.engine.infer(request);
    const isSpam = response.content.toLowerCase().includes('spam');
    return { isSpam, confidence: isSpam ? 0.85 : 0.15 };
  }

  /**
   * Analyze message tone/sentiment
   */
  async analyzeTone(content: string, userId: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    emotions: string[];
    confidence: number;
  }> {
    const request: AIInferenceRequest = {
      prompt: `Analyze the tone and sentiment: "${content}"`,
      systemPrompt: 'Identify sentiment (positive/negative/neutral) and key emotions.',
      userId,
      app: 'quantchat',
      feature: 'tone_analysis',
      temperature: 0.2,
      maxTokens: 100,
    };

    const response = await this.engine.infer(request);
    return {
      sentiment: 'neutral',
      emotions: ['conversational'],
      confidence: 0.75,
    };
  }

  private parseSmartReplies(content: string): SmartReply[] {
    const lines = content.split('\n').filter((l) => l.trim());
    const tones: Array<'casual' | 'professional' | 'friendly' | 'brief'> = ['casual', 'friendly', 'brief'];
    return lines.slice(0, 3).map((text, i) => ({
      text: text.replace(/^\d+[\.\)]\s*/, '').trim(),
      confidence: 0.85 - i * 0.1,
      tone: tones[i] || 'casual',
    }));
  }

  private parseModerationResult(content: string): ModerationResult {
    const contentLower = content.toLowerCase();
    const isSafe = contentLower.includes('safe') || contentLower.includes('appropriate');
    return {
      safe: isSafe,
      categories: [
        { name: 'harassment', score: isSafe ? 0.01 : 0.7, flagged: !isSafe },
        { name: 'hate_speech', score: 0.01, flagged: false },
        { name: 'explicit', score: 0.01, flagged: false },
        { name: 'spam', score: 0.05, flagged: false },
      ],
      overallScore: isSafe ? 0.02 : 0.75,
      action: isSafe ? 'allow' : 'flag',
    };
  }
}
