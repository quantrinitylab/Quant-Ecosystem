import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIEmailService } from '../services/ai-email.service';

function createMockPrisma() {
  return {
    email: {
      findUnique: vi.fn(),
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

describe('AIEmailService', () => {
  let service: AIEmailService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let mailAI: ReturnType<typeof createMockMailAI>;

  beforeEach(() => {
    prisma = createMockPrisma();
    mailAI = createMockMailAI();
    service = new AIEmailService(prisma as never, mailAI as never);
  });

  describe('summarize', () => {
    it('fetches email then calls MailAIService.summarizeEmail', async () => {
      const mockEmail = {
        id: 'email-1',
        userId: 'user-1',
        subject: 'Weekly Update',
        bodyPlain: 'Here are the project updates for this week...',
        bodyHtml: '',
      };
      prisma.email.findUnique.mockResolvedValue(mockEmail);
      prisma.email.update.mockResolvedValue({ ...mockEmail, aiSummary: 'Summary text' });

      mailAI.summarizeEmail.mockResolvedValue({
        type: 'summary',
        content: 'Summary of weekly project updates with action items.',
        confidence: 0.9,
      });

      const result = await service.summarize('email-1', 'user-1');

      expect(result.emailId).toBe('email-1');
      expect(result.summary).toBe('Summary of weekly project updates with action items.');
      expect(result.confidence).toBe(0.9);
      expect(mailAI.summarizeEmail).toHaveBeenCalledWith(
        'Weekly Update',
        'Here are the project updates for this week...',
        'user-1',
      );
      // Verify summary is stored
      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { aiSummary: 'Summary of weekly project updates with action items.' },
      });
    });

    it('throws EMAIL_NOT_FOUND for non-existent email', async () => {
      prisma.email.findUnique.mockResolvedValue(null);

      await expect(service.summarize('missing', 'user-1')).rejects.toThrow('Email not found');
    });

    it('throws FORBIDDEN when user does not own the email', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'other-user',
      });

      await expect(service.summarize('email-1', 'user-1')).rejects.toThrow('Not authorized');
    });
  });

  describe('composeAssistant', () => {
    it('delegates to MailAIService.composeEmail', async () => {
      mailAI.composeEmail.mockResolvedValue({
        type: 'compose',
        content: 'Dear Team,\n\nPlease find attached the report.\n\nBest regards',
        confidence: 0.85,
      });

      const result = await service.composeAssistant(
        'user-1',
        'Write a follow-up email about the report',
        { recipient: 'team@company.com', tone: 'professional' },
      );

      expect(result.content).toContain('Dear Team');
      expect(result.confidence).toBe(0.85);
      expect(mailAI.composeEmail).toHaveBeenCalledWith(
        'Write a follow-up email about the report',
        { recipient: 'team@company.com', tone: 'professional' },
        'user-1',
      );
    });
  });

  describe('classifyPriority', () => {
    it('returns high priority for urgent emails', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        subject: 'URGENT: Server down',
        bodyPlain: 'Production server is unresponsive',
        bodyHtml: '',
        fromAddress: 'ops@company.com',
      });

      mailAI.detectPriority.mockResolvedValue('high');

      const result = await service.classifyPriority('email-1', 'user-1');

      expect(result.emailId).toBe('email-1');
      expect(result.priority).toBe('high');
      expect(mailAI.detectPriority).toHaveBeenCalledWith(
        'URGENT: Server down',
        'Production server is unresponsive',
        'ops@company.com',
        'user-1',
      );
    });

    it('returns normal priority for regular emails', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-2',
        userId: 'user-1',
        subject: 'Meeting notes',
        bodyPlain: 'Notes from today',
        bodyHtml: '',
        fromAddress: 'colleague@company.com',
      });

      mailAI.detectPriority.mockResolvedValue('normal');

      const result = await service.classifyPriority('email-2', 'user-1');

      expect(result.priority).toBe('normal');
    });

    it('returns low priority for newsletters', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-3',
        userId: 'user-1',
        subject: 'Weekly Newsletter',
        bodyPlain: 'Top stories this week',
        bodyHtml: '',
        fromAddress: 'newsletter@service.com',
      });

      mailAI.detectPriority.mockResolvedValue('low');

      const result = await service.classifyPriority('email-3', 'user-1');

      expect(result.priority).toBe('low');
    });
  });

  describe('detectPhishing', () => {
    it('returns structured phishing result', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        subject: 'Verify your account NOW',
        bodyPlain: 'Click here to verify: http://suspicious-link.com',
        bodyHtml: '',
        fromAddress: 'security@bank-verification.xyz',
      });

      mailAI.detectPhishing.mockResolvedValue({
        isPhishing: true,
        confidence: 0.8,
        indicators: ['Suspicious patterns detected'],
      });

      const result = await service.detectPhishing('email-1', 'user-1');

      expect(result.emailId).toBe('email-1');
      expect(result.isPhishing).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.indicators).toContain('Suspicious patterns detected');
    });

    it('returns non-phishing for safe emails', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-2',
        userId: 'user-1',
        subject: 'Meeting tomorrow',
        bodyPlain: 'See you at 3pm',
        bodyHtml: '',
        fromAddress: 'boss@company.com',
      });

      mailAI.detectPhishing.mockResolvedValue({
        isPhishing: false,
        confidence: 0.1,
        indicators: [],
      });

      const result = await service.detectPhishing('email-2', 'user-1');

      expect(result.isPhishing).toBe(false);
      expect(result.indicators).toHaveLength(0);
    });
  });

  describe('suggestReplies', () => {
    it('returns reply suggestions from MailAIService', async () => {
      prisma.email.findUnique.mockResolvedValue({
        id: 'email-1',
        userId: 'user-1',
        subject: 'Lunch tomorrow?',
        bodyPlain: 'Want to grab lunch tomorrow at noon?',
        bodyHtml: '',
        fromAddress: 'friend@test.com',
      });

      mailAI.suggestReplies.mockResolvedValue([
        { type: 'reply_suggestion', content: 'Sounds great!', confidence: 0.8 },
        {
          type: 'reply_suggestion',
          content: 'I would love to, let me check my schedule.',
          confidence: 0.8,
        },
        {
          type: 'reply_suggestion',
          content: 'Sorry, I have a conflict. How about next week?',
          confidence: 0.8,
        },
      ]);

      const result = await service.suggestReplies('email-1', 'user-1');

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('Sounds great!');
      expect(result[2].content).toContain('next week');
      expect(mailAI.suggestReplies).toHaveBeenCalledWith(
        {
          subject: 'Lunch tomorrow?',
          body: 'Want to grab lunch tomorrow at noon?',
          from: 'friend@test.com',
        },
        'user-1',
      );
    });
  });
});
