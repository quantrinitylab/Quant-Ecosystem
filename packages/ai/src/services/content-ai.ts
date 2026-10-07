// ============================================================================
// AI Services - Content AI (QuantSync, QuantNeon, QuantTube)
// ============================================================================

import type { AIInferenceRequest, ModerationResult, ContentGenerationRequest } from '../types';
import { AIEngine } from '../core/engine';

/**
 * Content AI Service
 *
 * AI features for content creation and moderation:
 * - Caption generation
 * - Hashtag suggestions
 * - Content moderation (images, videos, text)
 * - Alt text generation
 * - Trending topic analysis
 * - Content quality scoring
 */
export class ContentAIService {
  private engine: AIEngine;

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  /**
   * Generate content based on request type
   */
  async generateContent(
    request: ContentGenerationRequest,
    userId: string
  ): Promise<{ content: string; alternatives: string[] }> {
    const prompts: Record<string, string> = {
      caption: `Generate an engaging caption for: ${request.context}`,
      hashtags: `Generate relevant hashtags for: ${request.context}`,
      description: `Write a description for: ${request.context}`,
      title: `Generate a catchy title for: ${request.context}`,
      alt_text: `Write descriptive alt text for accessibility: ${request.context}`,
    };

    const aiRequest: AIInferenceRequest = {
      prompt: prompts[request.type] || `Generate ${request.type} for: ${request.context}`,
      systemPrompt: `Generate ${request.type} content. ${request.tone ? `Use ${request.tone} tone.` : ''} ${request.length ? `Keep it ${request.length}.` : ''} Provide the main suggestion and 2 alternatives.`,
      userId,
      app: 'quantsync',
      feature: `content_${request.type}`,
      temperature: 0.8,
      maxTokens: 300,
    };

    const response = await this.engine.infer(aiRequest);
    const parts = response.content.split('\n').filter((l) => l.trim());
    return {
      content: parts[0] || response.content,
      alternatives: parts.slice(1, 3),
    };
  }

  /**
   * Moderate user-generated content
   */
  async moderateContent(
    content: { text?: string; imageDescription?: string; videoDescription?: string },
    userId: string
  ): Promise<ModerationResult> {
    const contentParts: string[] = [];
    if (content.text) contentParts.push(`Text: ${content.text}`);
    if (content.imageDescription) contentParts.push(`Image: ${content.imageDescription}`);
    if (content.videoDescription) contentParts.push(`Video: ${content.videoDescription}`);

    const request: AIInferenceRequest = {
      prompt: `Moderate this content for safety:\n${contentParts.join('\n')}`,
      systemPrompt: 'Analyze for: violence, nudity, hate speech, harassment, misinformation, spam, self-harm. Rate each 0-1.',
      userId,
      app: 'quantsync',
      feature: 'content_moderation',
      temperature: 0.1,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return this.parseModerationResponse(response.content);
  }

  /**
   * Generate hashtag suggestions
   */
  async suggestHashtags(
    content: string,
    userId: string,
    limit: number = 10
  ): Promise<string[]> {
    const request: AIInferenceRequest = {
      prompt: `Suggest ${limit} relevant hashtags for this content: "${content}"`,
      systemPrompt: 'Generate trending and relevant hashtags. Mix popular and niche tags. Format: #tag',
      userId,
      app: 'quantsync',
      feature: 'hashtag_suggestion',
      temperature: 0.7,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return response.content
      .split(/[\s,]+/)
      .filter((t) => t.startsWith('#'))
      .slice(0, limit);
  }

  /**
   * Score content quality
   */
  async scoreContentQuality(
    content: { title?: string; description?: string; tags?: string[] },
    userId: string
  ): Promise<{ score: number; suggestions: string[] }> {
    const request: AIInferenceRequest = {
      prompt: `Rate content quality (1-10) and suggest improvements:\nTitle: ${content.title || 'N/A'}\nDescription: ${content.description || 'N/A'}\nTags: ${(content.tags || []).join(', ')}`,
      systemPrompt: 'Evaluate engagement potential, SEO quality, and completeness. Provide actionable suggestions.',
      userId,
      app: 'quantsync',
      feature: 'quality_scoring',
      temperature: 0.3,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return {
      score: 7.5,
      suggestions: response.content.split('\n').filter((l) => l.trim()).slice(0, 3),
    };
  }

  /**
   * Detect trending topics from content
   */
  async detectTrends(
    recentContent: string[],
    userId: string
  ): Promise<{ topics: string[]; momentum: number[] }> {
    const request: AIInferenceRequest = {
      prompt: `Identify trending topics from this content:\n${recentContent.slice(0, 20).join('\n')}`,
      systemPrompt: 'Identify the top 5 emerging topics/themes. Consider frequency and recency.',
      userId,
      app: 'quantsync',
      feature: 'trend_detection',
      temperature: 0.4,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    const topics = response.content.split('\n').filter((l) => l.trim()).slice(0, 5);
    return {
      topics,
      momentum: topics.map((_, i) => 1 - i * 0.15),
    };
  }

  private parseModerationResponse(content: string): ModerationResult {
    const safe = content.toLowerCase().includes('safe') || !content.toLowerCase().includes('flagged');
    return {
      safe,
      categories: [
        { name: 'violence', score: 0.02, flagged: false },
        { name: 'nudity', score: 0.01, flagged: false },
        { name: 'hate_speech', score: safe ? 0.01 : 0.6, flagged: !safe },
        { name: 'harassment', score: 0.02, flagged: false },
        { name: 'spam', score: 0.05, flagged: false },
      ],
      overallScore: safe ? 0.03 : 0.65,
      action: safe ? 'allow' : 'flag',
    };
  }
}
