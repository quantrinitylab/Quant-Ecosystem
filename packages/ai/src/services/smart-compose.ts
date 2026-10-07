// ============================================================================
// AI Services - Smart Compose
// ============================================================================

import type { AIInferenceRequest } from '../types';
import { AIEngine } from '../core/engine';

export interface ComposeOptions {
  tone?: 'professional' | 'casual' | 'friendly' | 'formal' | 'persuasive';
  length?: 'short' | 'medium' | 'long';
  language?: string;
  context?: string;
}

export interface ComposeResult {
  text: string;
  suggestions: string[];
  tone: string;
  wordCount: number;
}

export class SmartComposeService {
  private engine: AIEngine;

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  async compose(
    prompt: string,
    userId: string,
    options: ComposeOptions = {},
  ): Promise<ComposeResult> {
    const tone = options.tone || 'professional';
    const length = options.length || 'medium';
    const language = options.language || 'English';

    const lengthGuide: Record<string, string> = {
      short: 'Keep it under 50 words.',
      medium: 'Aim for 50-150 words.',
      long: 'Write 150-300 words with detail.',
    };

    const request: AIInferenceRequest = {
      prompt: `Compose a ${tone} message about: "${prompt}"${options.context ? `\nContext: ${options.context}` : ''}`,
      systemPrompt: `You are a writing assistant. Write in ${language} with a ${tone} tone. ${lengthGuide[length]} Do not include meta-commentary.`,
      userId,
      app: 'quantai',
      feature: 'smart_compose',
      temperature: 0.7,
      maxTokens: length === 'short' ? 100 : length === 'medium' ? 300 : 600,
    };

    const response = await this.engine.infer(request);
    const suggestions = await this.generateSuggestions(response.content, userId);

    return {
      text: response.content,
      suggestions,
      tone,
      wordCount: response.content.split(/\s+/).filter(Boolean).length,
    };
  }

  async improve(
    text: string,
    userId: string,
    options: ComposeOptions = {},
  ): Promise<ComposeResult> {
    const tone = options.tone || 'professional';

    const request: AIInferenceRequest = {
      prompt: `Improve this text while keeping the core message. Make it more ${tone}:\n\n"${text}"`,
      systemPrompt:
        'You are an editing assistant. Improve clarity, grammar, and tone without changing the meaning. Return only the improved text.',
      userId,
      app: 'quantai',
      feature: 'smart_compose_improve',
      temperature: 0.5,
      maxTokens: Math.ceil(text.length / 2),
    };

    const response = await this.engine.infer(request);

    return {
      text: response.content,
      suggestions: [],
      tone,
      wordCount: response.content.split(/\s+/).filter(Boolean).length,
    };
  }

  async continueWriting(
    text: string,
    userId: string,
    options: ComposeOptions = {},
  ): Promise<string> {
    const tone = options.tone || 'professional';

    const request: AIInferenceRequest = {
      prompt: `Continue writing from where this text leaves off:\n\n"${text}"`,
      systemPrompt: `You are a writing assistant. Continue the text naturally in a ${tone} tone. Do not repeat what was already written.`,
      userId,
      app: 'quantai',
      feature: 'smart_compose_continue',
      temperature: 0.7,
      maxTokens: 300,
    };

    const response = await this.engine.infer(request);
    return response.content;
  }

  private async generateSuggestions(text: string, userId: string): Promise<string[]> {
    const request: AIInferenceRequest = {
      prompt: `Given this text, suggest 3 alternative phrasings or follow-up sentences:\n\n"${text}"`,
      systemPrompt: 'Provide exactly 3 brief alternative suggestions, one per line. No numbering.',
      userId,
      app: 'quantai',
      feature: 'smart_compose_suggestions',
      temperature: 0.8,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return response.content
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
  }
}
