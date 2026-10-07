// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpamClassifierService } from '../services/spam-classifier.service';
import { InboundIngestAdapter, type InboundRawMessage } from '../services/inbound-ingest.service';
import type { DeliverabilityAuthService } from '../services/deliverability-auth.service';

describe('SpamClassifierService (Task QM-03)', () => {
  let classifier: SpamClassifierService;

  beforeEach(() => {
    classifier = new SpamClassifierService();
  });

  it('classifies blatant pharmaceutical spam with high score and quarantine verdict', () => {
    const result = classifier.classify({
      from: 'cheap-meds@untrusted-source.biz',
      subject: 'Buy generic cheap viagra and cialis online today',
      text: 'Order pills online now with discount coupons and no prescription needed.',
    });

    expect(result.isSpam).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons.some((r) => r.toLowerCase().includes('pharmaceutical'))).toBe(true);
  });

  it('classifies 419 advance-fee scam as spam', () => {
    const result = classifier.classify({
      from: 'barrister@estate-attorney.org',
      subject: 'Urgent: Inheritance fund wire transfer sum of 15 million dollars',
      text: 'Dear beloved, I am the personal attorney to a deceased client. You are listed as beneficiary.',
    });

    expect(result.isSpam).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons.some((r) => r.toLowerCase().includes('advance fee'))).toBe(true);
  });

  it('classifies authentic business communication as ham (clean)', () => {
    const result = classifier.classify({
      from: 'sarah@quantmail.in',
      subject: 'Updated quarterly project review meeting schedule',
      text: 'Hi team, please find attached the updated deck and meeting agenda for tomorrow. Thanks, Sarah',
    });

    expect(result.isSpam).toBe(false);
    expect(result.score).toBeLessThan(0.4);
  });

  it('learns and adapts from user feedback via trainSpam and trainHam', () => {
    const edgeCaseMessage = 'Special discount on corporate software licensing';

    // Train on spam patterns
    for (let i = 0; i < 5; i++) {
      classifier.trainSpam(edgeCaseMessage);
    }

    const spamEvaluation = classifier.classify({
      from: 'sales@software-vendor.com',
      subject: 'Special discount on corporate software licensing',
      text: 'Software licensing special discount available today.',
    });

    expect(spamEvaluation.score).toBeGreaterThan(0.5);

    // Now train as ham (user marked as not spam)
    for (let i = 0; i < 15; i++) {
      classifier.trainHam(edgeCaseMessage);
    }

    const hamEvaluation = classifier.classify({
      from: 'sales@software-vendor.com',
      subject: 'Special discount on corporate software licensing',
      text: 'Software licensing special discount available today.',
    });

    expect(hamEvaluation.score).toBeLessThan(spamEvaluation.score);
  });

  it('quarantines inbound mail via InboundIngestAdapter when classified as spam', async () => {
    const mockPrisma: any = {
      emailFolder: {
        findFirst: vi.fn().mockImplementation((args: any) => {
          if (args.where.type === 'SPAM') return Promise.resolve({ id: 'folder-spam' });
          if (args.where.type === 'INBOX') return Promise.resolve({ id: 'folder-inbox' });
          return Promise.resolve(null);
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }),
      },
      email: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockAuthService: any = {
      verifyInbound: vi.fn().mockResolvedValue({
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
      }),
    };

    const mockEmailService: any = {
      receive: vi
        .fn()
        .mockImplementation((data: any) => Promise.resolve({ id: 'email-1', ...data })),
    };

    const mockThreadService: any = {
      stitchInbound: vi.fn().mockResolvedValue('thread-1'),
    };

    const adapter = new InboundIngestAdapter(
      mockPrisma as any,
      mockAuthService as DeliverabilityAuthService,
      {
        email: mockEmailService,
        thread: mockThreadService,
        spamClassifier: classifier,
      },
    );

    const spamMessage: InboundRawMessage = {
      from: 'spammer@phishing-attack.com',
      to: ['user@quantmail.in'],
      subject: 'Claim your prize! Urgent: verify your account password expires today',
      text: 'Guaranteed 100x return and crypto investment reward. Click to claim.',
    };

    const ingested = await adapter.ingest(spamMessage);

    expect((ingested as any).isSpam).toBe(true);
    expect(ingested.folderId).toBe('folder-spam');
    expect(mockEmailService.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        isSpam: true,
        folderId: 'folder-spam',
      }),
    );
  });
});
