import type { PrismaClient } from '@prisma/client';
import type { MailAIService, ThreadContextMessage } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import {
  ALL_CAPABILITIES,
  assertQuantyContextBudget,
  buildMutationPreview,
  createEvidenceRef,
  createResourceRef,
  estimatePayloadBytes,
  quantyContextBudgetFor,
  quoteCost,
  recordProvenance,
  type Capability,
  type CostQuote,
  type EvidenceRef,
  type MutationPreview,
  type ProvenanceRecord,
  type QuantyContextError,
} from '@quant/app-registry';

export interface SummarizeResult {
  emailId: string;
  summary: string;
  confidence: number;
  /** QM-QUANTY-002: every claim traceable to the source mail. */
  evidence: EvidenceRef[];
  provenance: ProvenanceRecord;
  cost: CostQuote;
}

export interface ComposeAssistResult {
  content: string;
  confidence: number;
  /** QM-QUANTY-002: empty when the assist had no source mail; never fabricated. */
  evidence: EvidenceRef[];
  provenance: ProvenanceRecord;
  cost: CostQuote;
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
  /** QM-QUANTY-002: the source message(s) that informed this suggestion. */
  evidence: EvidenceRef[];
}

export interface SuggestRepliesResult {
  emailId: string;
  suggestions: ReplySuggestion[];
  provenance: ProvenanceRecord;
  cost: CostQuote;
}

function capabilityOrThrow(capabilityId: string): Capability {
  const found = ALL_CAPABILITIES.find((c) => c.capabilityId === capabilityId);
  if (!found) {
    throw createAppError(
      `Capability ${capabilityId} is not registered — refusing to run an unregistered Quanty surface.`,
      500,
      'CAPABILITY_NOT_REGISTERED',
    );
  }
  return found;
}

/** Typed resource ref for a mail message — the evidence anchor for AI outputs. */
function mailMessageRef(emailId: string) {
  return createResourceRef({
    appId: 'quantmail',
    resourceType: 'mail.message',
    resourceId: emailId,
  });
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

    const capability = capabilityOrThrow('mail.ai.summarize');
    const body = email.bodyPlain || email.bodyHtml || '';
    const contextBytes = estimatePayloadBytes({ subject: email.subject, body });
    // Governed minimum useful context: fail closed when a single mail exceeds
    // the inline budget instead of silently sending a truncated body.
    assertQuantyContextBudget(
      { subject: email.subject, body },
      quantyContextBudgetFor(capability.riskTier),
    );

    const result = await this.mailAI.summarizeEmail(email.subject, body, userId);

    // Store summary on the email
    await this.prisma.email.update({
      where: { id: emailId },
      data: { aiSummary: result.content },
    });

    const evidence = [
      createEvidenceRef(
        mailMessageRef(emailId),
        email.subject || '(no subject)',
        body.slice(0, 280),
      ),
    ];

    return {
      emailId,
      summary: result.content,
      confidence: result.confidence,
      evidence,
      provenance: recordProvenance({
        producedBy: 'quanty-model',
        capability,
        contextBytes,
        contextTruncated: false,
        sourceCount: 1,
      }),
      cost: quoteCost(capability),
    };
  }

  async composeAssistant(
    userId: string,
    instructions: string,
    context: { recipient?: string; subject?: string; tone?: string },
  ): Promise<ComposeAssistResult> {
    const capability = capabilityOrThrow('mail.ai.compose.assist');
    const contextBytes = estimatePayloadBytes({ instructions, context });
    assertQuantyContextBudget(
      { instructions, context },
      quantyContextBudgetFor(capability.riskTier),
    );

    const result = await this.mailAI.composeEmail(instructions, context, userId);

    return {
      content: result.content,
      confidence: result.confidence,
      // Compose assist has no source mail — evidence stays honestly empty
      // rather than pointing at an unrelated message.
      evidence: [],
      provenance: recordProvenance({
        producedBy: 'quanty-model',
        capability,
        contextBytes,
        contextTruncated: false,
        sourceCount: 0,
      }),
      cost: quoteCost(capability),
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

  async suggestReplies(emailId: string, userId: string): Promise<SuggestRepliesResult> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const capability = capabilityOrThrow('mail.ai.reply.suggest');
    const budget = quantyContextBudgetFor(capability.riskTier);

    const threadContext = await this.loadThreadContext(email, userId);
    const source = {
      subject: email.subject,
      body: email.bodyPlain || email.bodyHtml || '',
      from: email.fromAddress,
    };

    // Context boundary: measure first; drop oldest thread messages until the
    // payload fits the governed budget. The truncation is recorded in
    // provenance — the model never silently receives a partial thread.
    const fitted = this.fitContextToBudget(source, threadContext, budget);

    const results = await this.mailAI.suggestReplies(source, userId, fitted.messages);

    const evidence: EvidenceRef[] = [
      createEvidenceRef(
        mailMessageRef(emailId),
        email.subject || '(no subject)',
        source.body.slice(0, 280),
      ),
      ...fitted.messages.map((m) =>
        createEvidenceRef(
          mailMessageRef(m.id),
          m.from || '(unknown sender)',
          m.body.slice(0, 280),
        ),
      ),
    ];

    return {
      emailId,
      suggestions: results.map((r) => ({
        content: r.content,
        confidence: r.confidence,
        evidence,
      })),
      provenance: recordProvenance({
        producedBy: 'quanty-model',
        capability,
        contextBytes: fitted.bytes,
        contextTruncated: fitted.truncated,
        sourceCount: 1 + fitted.messages.length,
      }),
      cost: quoteCost(capability),
    };
  }

  /**
   * QM-QUANTY-002 — preview before mutation. Builds the exact preview the
   * user reviews before `mail.send.execute` runs: recipients, subject,
   * size, cost, approval requirement (tier 3) and reversibility (undo-send
   * window). The preview carries the idempotency key the execution must use.
   */
  async prepareSendPreview(emailId: string, userId: string): Promise<MutationPreview> {
    const email = await this.prisma.email.findUnique({ where: { id: emailId } });

    if (!email) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    const capability = capabilityOrThrow('mail.send.execute');
    const recipients: string[] = Array.isArray((email as { toAddresses?: unknown }).toAddresses)
      ? ((email as { toAddresses?: string[] }).toAddresses ?? [])
      : [];
    const bodyLength = (email.bodyPlain || email.bodyHtml || '').length;

    return buildMutationPreview({
      capability,
      summary: `Send email to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`,
      changes: [
        {
          description: `Send "${email.subject || '(no subject)'}" to ${recipients.join(', ') || '(no recipients)'}`,
          detail: {
            emailId,
            recipientCount: recipients.length,
            subject: email.subject,
            bodyChars: bodyLength,
          },
        },
      ],
      reversibility: {
        reversible: true,
        undoCapabilityId: 'mail.send.execute',
        note: 'Undo send is available for 30 seconds after sending; after that the message cannot be recalled from recipient servers.',
      },
    });
  }

  /**
   * Drop oldest-first thread messages until the full payload fits the
   * governed budget. Returns the surviving messages, whether anything was
   * dropped, and the final measured bytes.
   */
  private fitContextToBudget(
    source: { subject: string | null; body: string; from: string | null },
    messages: Array<ThreadContextMessage & { id: string }>,
    budget: number,
  ): { messages: Array<ThreadContextMessage & { id: string }>; truncated: boolean; bytes: number } {
    const kept = [...messages];
    let truncated = false;
    // The source message itself is always kept — it is the thing being replied to.
    let bytes = estimatePayloadBytes({ source, messages: kept });
    while (kept.length > 0 && bytes > budget) {
      kept.shift();
      truncated = true;
      bytes = estimatePayloadBytes({ source, messages: kept });
    }
    // Fail closed if even the bare source message exceeds the budget.
    assertQuantyContextBudget({ source, messages: kept }, budget);
    return { messages: kept, truncated, bytes };
  }

  /**
   * Recent messages from the same thread, oldest first, excluding the message
   * being replied to (the model already receives that one separately).
   *
   * Capped at six: enough for the model to pick up the topic, the tone, and
   * any open questions, small enough that the suggestion round-trip stays
   * fast. A message with no thread is not an error — a single mail still gets
   * suggestions, just without conversation context.
   *
   * QM-QUANTY-002: message ids and subjects are selected so every context
   * message becomes a typed evidence ref.
   */
  private async loadThreadContext(
    email: { id: string; threadId: string | null },
    userId: string,
  ): Promise<Array<ThreadContextMessage & { id: string }>> {
    if (!email.threadId) {
      return [];
    }

    const messages = await this.prisma.email.findMany({
      where: {
        userId,
        threadId: email.threadId,
        id: { not: email.id },
        deletedAt: null,
      },
      orderBy: { receivedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        bodyPlain: true,
        bodyHtml: true,
        isSent: true,
      },
    });

    return messages.reverse().map((message) => ({
      id: message.id,
      from: message.fromName || message.fromAddress,
      body: message.bodyPlain || message.bodyHtml || '',
      isMine: message.isSent,
    }));
  }
}

export type { QuantyContextError };
