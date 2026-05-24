// ============================================================================
// AI Services - Mail AI (QuantMail)
// ============================================================================

import type { AIInferenceRequest, EmailAIResult } from '../types';
import { AIEngine } from '../core/engine';

/**
 * Mail AI Service
 *
 * AI features for QuantMail:
 * - Email composition assistance
 * - Email summarization
 * - Smart categorization
 * - Reply suggestions
 * - Priority detection
 * - Phishing detection
 */
export class MailAIService {
  private engine: AIEngine;

  constructor(engine: AIEngine) {
    this.engine = engine;
  }

  /**
   * Summarize an email thread
   */
  async summarizeEmail(
    subject: string,
    body: string,
    userId: string
  ): Promise<EmailAIResult> {
    const request: AIInferenceRequest = {
      prompt: `Summarize this email:\nSubject: ${subject}\n\n${body}`,
      systemPrompt: 'Provide a concise 2-3 sentence summary capturing the key points and any action items.',
      userId,
      app: 'quantmail',
      feature: 'email_summary',
      temperature: 0.3,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    return {
      type: 'summary',
      content: response.content,
      confidence: 0.9,
    };
  }

  /**
   * Help compose an email
   */
  async composeEmail(
    instructions: string,
    context: { recipient?: string; subject?: string; tone?: string },
    userId: string
  ): Promise<EmailAIResult> {
    const toneInstruction = context.tone ? `Use a ${context.tone} tone.` : 'Use a professional tone.';
    const prompt = [
      `Compose an email based on these instructions: ${instructions}`,
      context.recipient ? `To: ${context.recipient}` : '',
      context.subject ? `Subject: ${context.subject}` : '',
      toneInstruction,
    ].filter(Boolean).join('\n');

    const request: AIInferenceRequest = {
      prompt,
      systemPrompt: 'Compose a well-structured email. Include a greeting, body, and sign-off.',
      userId,
      app: 'quantmail',
      feature: 'email_compose',
      temperature: 0.7,
      maxTokens: 500,
    };

    const response = await this.engine.infer(request);
    return {
      type: 'compose',
      content: response.content,
      confidence: 0.85,
    };
  }

  /**
   * Categorize an email automatically
   */
  async categorizeEmail(
    subject: string,
    body: string,
    fromAddress: string,
    userId: string
  ): Promise<EmailAIResult> {
    const request: AIInferenceRequest = {
      prompt: `Categorize this email:\nFrom: ${fromAddress}\nSubject: ${subject}\nBody: ${body.substring(0, 500)}`,
      systemPrompt: 'Categorize into one of: primary, social, promotions, updates, forums, spam. Also suggest labels.',
      userId,
      app: 'quantmail',
      feature: 'email_categorize',
      temperature: 0.2,
      maxTokens: 100,
    };

    const response = await this.engine.infer(request);
    return {
      type: 'categorize',
      content: response.content,
      confidence: 0.88,
      metadata: {
        category: this.extractCategory(response.content),
        labels: this.extractLabels(response.content),
      },
    };
  }

  /**
   * Generate reply suggestions for an email
   */
  async suggestReplies(
    originalEmail: { subject: string; body: string; from: string },
    userId: string
  ): Promise<EmailAIResult[]> {
    const request: AIInferenceRequest = {
      prompt: `Suggest 3 reply options for this email:\nFrom: ${originalEmail.from}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body.substring(0, 500)}`,
      systemPrompt: 'Generate 3 reply options: brief acknowledgment, detailed response, and a polite decline/delay. Keep each under 100 words.',
      userId,
      app: 'quantmail',
      feature: 'reply_suggestions',
      temperature: 0.7,
      maxTokens: 400,
    };

    const response = await this.engine.infer(request);
    const replies = response.content.split('\n\n').filter((r) => r.trim());
    return replies.slice(0, 3).map((reply) => ({
      type: 'reply_suggestion' as const,
      content: reply.trim(),
      confidence: 0.8,
    }));
  }

  /**
   * Detect email priority
   */
  async detectPriority(
    subject: string,
    body: string,
    fromAddress: string,
    userId: string
  ): Promise<'high' | 'normal' | 'low'> {
    const request: AIInferenceRequest = {
      prompt: `Determine priority (high/normal/low) for:\nFrom: ${fromAddress}\nSubject: ${subject}\nBody: ${body.substring(0, 300)}`,
      systemPrompt: 'Classify priority. High: urgent action needed, deadlines, important contacts. Low: newsletters, automated, non-urgent.',
      userId,
      app: 'quantmail',
      feature: 'priority_detection',
      temperature: 0.1,
      maxTokens: 50,
    };

    const response = await this.engine.infer(request);
    const lower = response.content.toLowerCase();
    if (lower.includes('high')) return 'high';
    if (lower.includes('low')) return 'low';
    return 'normal';
  }

  /**
   * Detect potential phishing emails
   */
  async detectPhishing(
    subject: string,
    body: string,
    fromAddress: string,
    userId: string
  ): Promise<{ isPhishing: boolean; confidence: number; indicators: string[] }> {
    const request: AIInferenceRequest = {
      prompt: `Analyze for phishing indicators:\nFrom: ${fromAddress}\nSubject: ${subject}\nBody: ${body.substring(0, 500)}`,
      systemPrompt: 'Check for phishing: suspicious links, urgency, impersonation, unusual requests, grammar issues.',
      userId,
      app: 'quantmail',
      feature: 'phishing_detection',
      temperature: 0.1,
      maxTokens: 200,
    };

    const response = await this.engine.infer(request);
    const isPhishing = response.content.toLowerCase().includes('phishing') ||
      response.content.toLowerCase().includes('suspicious');
    return {
      isPhishing,
      confidence: isPhishing ? 0.8 : 0.1,
      indicators: isPhishing ? ['Suspicious patterns detected'] : [],
    };
  }

  private extractCategory(content: string): string {
    const categories = ['primary', 'social', 'promotions', 'updates', 'forums', 'spam'];
    const lower = content.toLowerCase();
    return categories.find((c) => lower.includes(c)) || 'primary';
  }

  private extractLabels(content: string): string[] {
    const commonLabels = ['work', 'personal', 'finance', 'travel', 'shopping', 'health'];
    const lower = content.toLowerCase();
    return commonLabels.filter((l) => lower.includes(l));
  }
}
