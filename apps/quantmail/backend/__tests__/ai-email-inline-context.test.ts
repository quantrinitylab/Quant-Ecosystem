/**
 * QM-QUANTY-002 — integration tests for the AIEmailService inline-context wiring.
 *
 * Proves: evidence refs attached to suggestions/summaries, context-budget
 * enforcement with oldest-first truncation, provenance completeness, cost
 * quotes, and the send-preview contract (preview before mutation).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIEmailService } from '../services/ai-email.service';

function createMockPrisma() {
  return {
    email: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

function createMockMailAI() {
  return {
    summarizeEmail: vi.fn(),
    composeEmail: vi.fn(),
    detectPriority: vi.fn(),
    detectPhishing: vi.fn(),
    suggestReplies: vi.fn(),
    categorizeEmail: vi.fn(),
  };
}

const BASE_EMAIL = {
  id: 'email-1',
  userId: 'user-1',
  threadId: 'thread-1',
  subject: 'Launch plan',
  bodyPlain: 'We launch on Friday. Please confirm the checklist.',
  bodyHtml: '',
  fromAddress: 'boss@example.com',
  fromName: 'Boss',
  toAddresses: ['me@quantmail.in'],
};

function threadMessage(id: string, body: string) {
  return {
    id,
    subject: 'Re: Launch plan',
    fromName: 'Teammate',
    fromAddress: 'team@example.com',
    bodyPlain: body,
    bodyHtml: '',
    isSent: false,
  };
}

describe('AIEmailService QM-QUANTY-002 wiring', () => {
  let service: AIEmailService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let mailAI: ReturnType<typeof createMockMailAI>;

  beforeEach(() => {
    prisma = createMockPrisma();
    mailAI = createMockMailAI();
    service = new AIEmailService(prisma as never, mailAI as never);
    prisma.email.findUnique.mockResolvedValue({ ...BASE_EMAIL });
    prisma.email.findMany.mockResolvedValue([]);
  });

  describe('suggestReplies', () => {
    it('attaches evidence refs, provenance and cost to the envelope', async () => {
      prisma.email.findMany.mockResolvedValue([threadMessage('m-2', 'Checklist is ready.')]);
      mailAI.suggestReplies.mockResolvedValue([
        { content: 'Confirmed, thanks!', confidence: 0.9 },
      ]);

      const result = await service.suggestReplies('email-1', 'user-1');

      expect(result.emailId).toBe('email-1');
      expect(result.suggestions).toHaveLength(1);
      const suggestion = result.suggestions[0];
      expect(suggestion.content).toBe('Confirmed, thanks!');
      // Evidence: the source mail + the thread message that informed it.
      expect(suggestion.evidence.length).toBeGreaterThanOrEqual(2);
      expect(suggestion.evidence[0].resourceRef.resourceId).toBe('email-1');
      expect(suggestion.evidence[0].resourceRef.resourceType).toBe('mail.message');
      // Provenance: complete record.
      expect(result.provenance.producedBy).toBe('quanty-model');
      expect(result.provenance.capabilityId).toBe('mail.ai.reply.suggest');
      expect(result.provenance.contextTruncated).toBe(false);
      expect(result.provenance.sourceCount).toBe(2);
      expect(result.provenance.contextBytes).toBeGreaterThan(0);
      // Cost: upfront quote from the declared meter.
      expect(result.cost.meter).toBe('ai.tokens');
      expect(result.cost.credits).toBeGreaterThan(0);
    });

    it('truncates oldest-first when thread context exceeds the budget', async () => {
      const huge = 'x'.repeat(40 * 1024);
      prisma.email.findMany.mockResolvedValue([
        threadMessage('m-old', huge),
        threadMessage('m-new', 'short reply'),
      ]);
      mailAI.suggestReplies.mockResolvedValue([{ content: 'OK', confidence: 0.8 }]);

      const result = await service.suggestReplies('email-1', 'user-1');

      expect(result.provenance.contextTruncated).toBe(true);
      // The surviving evidence must not include the dropped huge message.
      const ids = result.suggestions[0].evidence.map((e) => e.resourceRef.resourceId);
      expect(ids).not.toContain('m-old');
      expect(ids).toContain('email-1');
      // The model received the truncated set.
      const sentContext = mailAI.suggestReplies.mock.calls[0][2] as Array<{ id: string }>;
      expect(sentContext.map((m) => m.id)).not.toContain('m-old');
    });

    it('fails closed when even the bare source message exceeds the budget', async () => {
      prisma.email.findUnique.mockResolvedValue({
        ...BASE_EMAIL,
        bodyPlain: 'y'.repeat(64 * 1024),
      });
      await expect(service.suggestReplies('email-1', 'user-1')).rejects.toMatchObject({
        name: 'QuantyContextError',
      });
      expect(mailAI.suggestReplies).not.toHaveBeenCalled();
    });

    it('still rejects unauthorized users before touching the model', async () => {
      prisma.email.findUnique.mockResolvedValue({ ...BASE_EMAIL, userId: 'other' });
      await expect(service.suggestReplies('email-1', 'user-1')).rejects.toThrow();
      expect(mailAI.suggestReplies).not.toHaveBeenCalled();
    });
  });

  describe('summarize', () => {
    it('returns evidence, provenance and cost with the summary', async () => {
      mailAI.summarizeEmail.mockResolvedValue({ content: 'Launch Friday.', confidence: 0.95 });
      prisma.email.update.mockResolvedValue({});

      const result = await service.summarize('email-1', 'user-1');

      expect(result.summary).toBe('Launch Friday.');
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].resourceRef.resourceId).toBe('email-1');
      expect(result.evidence[0].label).toBe('Launch plan');
      expect(result.provenance.capabilityId).toBe('mail.ai.summarize');
      expect(result.provenance.sourceCount).toBe(1);
      expect(result.cost.meter).toBe('ai.tokens');
      // Existing behavior preserved: summary is cached on the email.
      // QM-BACK-002: system writes also bump the version column.
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { aiSummary: 'Launch Friday.', version: { increment: 1 } },
      });
    });
  });

  describe('composeAssistant', () => {
    it('records provenance and cost with honestly empty evidence', async () => {
      mailAI.composeEmail.mockResolvedValue({ content: 'Draft body', confidence: 0.8 });

      const result = await service.composeAssistant('user-1', 'write a follow-up', {
        recipient: 'a@example.com',
      });

      expect(result.content).toBe('Draft body');
      // No source mail exists for a free-form assist — evidence stays empty
      // rather than pointing at an unrelated message.
      expect(result.evidence).toEqual([]);
      expect(result.provenance.capabilityId).toBe('mail.ai.compose.assist');
      expect(result.provenance.sourceCount).toBe(0);
      expect(result.cost.credits).toBeGreaterThan(0);
    });
  });

  describe('prepareSendPreview', () => {
    it('builds a tier-3 preview: approval required, cost shown, reversible', async () => {
      const preview = await service.prepareSendPreview('email-1', 'user-1');

      expect(preview.capabilityId).toBe('mail.send.execute');
      expect(preview.requiresApproval).toBe(true);
      expect(preview.approvalReason).toContain('external side effect');
      expect(preview.summary).toContain('1 recipient');
      expect(preview.changes).toHaveLength(1);
      expect(preview.changes[0].description).toContain('me@quantmail.in');
      expect(preview.changes[0].description).toContain('Launch plan');
      expect(preview.cost.meter).toBe('mail.delivery');
      expect(preview.cost.credits).toBeGreaterThan(0);
      expect(preview.reversibility.reversible).toBe(true);
      expect(preview.reversibility.note).toContain('30 seconds');
      expect(preview.idempotencyKey).toBeTruthy();
      expect(preview.createdAt).toBeTruthy();
    });

    it('rejects unknown emails and unauthorized users', async () => {
      prisma.email.findUnique.mockResolvedValue(null);
      await expect(service.prepareSendPreview('nope', 'user-1')).rejects.toThrow('Email not found');

      prisma.email.findUnique.mockResolvedValue({ ...BASE_EMAIL, userId: 'other' });
      await expect(service.prepareSendPreview('email-1', 'user-1')).rejects.toThrow();
    });
  });
});
