import type { PrismaClient } from '@prisma/client';
import type { MailAIService } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export interface SummarizeResult {
  emailId: string;
  summary: string;
  confidence: number;
}

export interface ComposeAssistResult {
  content: string;
  confidence: number;
}

export interface ClassifyPriorityResult {
  emailId: string;
  priority: 'high' | 'normal' | 'low';
}

export interface PhishingResult {
  emailId: string;
  isPhishing: boolean;
  confidence: number;
  indicators: string[];
}

export interface ReplySuggestion {
  content: string;
  confidence: number;
}

export class AIEmailService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mailAI: MailAIService,
  ) {}

  async summarize(emailId: string, userId: string): Promise<SummarizeResult> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const result = await this.mailAI.summarizeEmail(
      email.subject,
      email.bodyPlain || email.bodyHtml || '',
      userId,
    );

    // Store summary on the email
    await this.prisma.email.update({
      where: { id: emailId },
      data: { aiSummary: result.content },
    });

    return {
      emailId,
      summary: result.content,
      confidence: result.confidence,
    };
  }

  async composeAssistant(
    userId: string,
    instructions: string,
    context: { recipient?: string; subject?: string; tone?: string },
  ): Promise<ComposeAssistResult> {
    const result = await this.mailAI.composeEmail(instructions, context, userId);

    return {
      content: result.content,
      confidence: result.confidence,
    };
  }

  async classifyPriority(emailId: string, userId: string): Promise<ClassifyPriorityResult> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const priority = await this.mailAI.detectPriority(
      email.subject,
      email.bodyPlain || email.bodyHtml || '',
      email.fromAddress,
      userId,
    );

    return {
      emailId,
      priority,
    };
  }

  async detectPhishing(emailId: string, userId: string): Promise<PhishingResult> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const result = await this.mailAI.detectPhishing(
      email.subject,
      email.bodyPlain || email.bodyHtml || '',
      email.fromAddress,
      userId,
    );

    return {
      emailId,
      isPhishing: result.isPhishing,
      confidence: result.confidence,
      indicators: result.indicators,
    };
  }

  async suggestReplies(emailId: string, userId: string): Promise<ReplySuggestion[]> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const results = await this.mailAI.suggestReplies(
      {
        subject: email.subject,
        body: email.bodyPlain || email.bodyHtml || '',
        from: email.fromAddress,
      },
      userId,
    );

    return results.map((r) => ({
      content: r.content,
      confidence: r.confidence,
    }));
  }
}
