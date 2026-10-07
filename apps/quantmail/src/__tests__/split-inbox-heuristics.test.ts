import { describe, expect, it } from 'vitest';
import {
  classifyEmailCategory,
  classifyThreadCategory,
  computeSplitInboxCounts,
  groupEmailsIntoThreads,
  type ConversationThread,
} from '../lib/threading';
import type { Email } from '../types';

let seq = 0;

/**
 * Creates a zero-mock typed Email instance with only the specified overrides.
 */
function createEmail(over: Partial<Email> & { subject: string; isSent?: boolean }): Email {
  return {
    id: `email_${++seq}`,
    threadId: `thread_${seq}`,
    userId: 'user_1',
    from: { email: 'colleague@example.com', name: 'Colleague' },
    to: [{ email: 'kundan@quant.com', name: 'Kundan' }],
    cc: [],
    bcc: [],
    bodyText: '',
    bodyHtml: '',
    snippet: '',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date('2026-09-25T10:00:00Z'),
    createdAt: new Date('2026-09-25T10:00:00Z'),
    updatedAt: new Date('2026-09-25T10:00:00Z'),
    ...over,
  } as unknown as Email;
}

describe('Split Inbox & Real-Time Categorization Heuristics', () => {
  describe('Primary Category Classification', () => {
    it('classifies direct 1-on-1 human correspondence as primary', () => {
      const email = createEmail({
        from: { email: 'alice@company.com', name: 'Alice Smith' },
        subject: 'Quick question about the sprint board',
        bodyText: 'Hey Kundan, do you have 5 minutes to sync on the roadmap?',
      });

      expect(classifyEmailCategory(email)).toBe('primary');
    });

    it('classifies note-to-self emails as primary', () => {
      const email = createEmail({
        from: { email: 'kundan@quant.com', name: 'Kundan' },
        to: [{ email: 'kundan@quant.com' }],
        subject: 'Notes from architecture meeting',
        bodyText: 'Remember to check distributed transactions on Monday.',
      });

      expect(classifyEmailCategory(email)).toBe('primary');
    });

    it('respects explicit server aiCategory primary', () => {
      const email = createEmail({
        from: { email: 'notifications@github.com' },
        subject: 'Issue opened',
        aiCategory: 'primary',
      });

      expect(classifyEmailCategory(email)).toBe('primary');
    });
  });

  describe('Updates Category Classification', () => {
    it('classifies GitHub and developer infrastructure senders as updates', () => {
      const ghEmail = createEmail({
        from: { email: 'notifications@github.com', name: 'GitHub' },
        subject: '[Quant-Ecosystem] Pull request #298 opened',
        bodyText: 'Node A opened a pull request for Sovereign Git Parity.',
      });

      const gitlabEmail = createEmail({
        from: { email: 'gitlab@company.internal' },
        subject: 'Pipeline #104 passed on main',
      });

      const awsEmail = createEmail({
        from: { email: 'no-reply-aws@amazon.com' },
        subject: 'Amazon Web Services CloudWatch Alarm',
      });

      expect(classifyEmailCategory(ghEmail)).toBe('updates');
      expect(classifyEmailCategory(gitlabEmail)).toBe('updates');
      expect(classifyEmailCategory(awsEmail)).toBe('updates');
    });

    it('classifies payment, billing, and Stripe senders as updates', () => {
      const stripeEmail = createEmail({
        from: { email: 'receipts@stripe.com' },
        subject: 'Your Stripe payment receipt',
        bodyText: 'Payment successful for Quant Cloud Plan.',
      });

      const paypalEmail = createEmail({
        from: { email: 'service@paypal.com' },
        subject: 'You sent a payment of $49.00',
      });

      expect(classifyEmailCategory(stripeEmail)).toBe('updates');
      expect(classifyEmailCategory(paypalEmail)).toBe('updates');
    });

    it('classifies receipts, shipping, orders, tracking, and invoices as updates via keywords', () => {
      const receiptEmail = createEmail({
        from: { email: 'billing@service.io' },
        subject: 'Your receipt for order #40921',
        bodyText: 'Thank you for your business. Invoice attached.',
      });

      const shippingEmail = createEmail({
        from: { email: 'delivery@carrier.com' },
        subject: 'Shipping update: package is in transit',
        bodyText: 'Tracking number: 1Z9999999999999999. Package delivered soon.',
      });

      const orderConfirmEmail = createEmail({
        from: { email: 'orders@vendor.com' },
        subject: 'Order confirmation: We received your order',
        bodyText: 'Your order has been confirmed. View order status online.',
      });

      expect(classifyEmailCategory(receiptEmail)).toBe('updates');
      expect(classifyEmailCategory(shippingEmail)).toBe('updates');
      expect(classifyEmailCategory(orderConfirmEmail)).toBe('updates');
    });

    it('classifies security alerts, password resets, and verification codes as updates', () => {
      const securityEmail = createEmail({
        from: { email: 'security@cloudservice.com' },
        subject: 'Security alert: New sign-in detected',
        bodyText: 'A new login from Windows was detected on your account.',
      });

      const pwResetEmail = createEmail({
        from: { email: 'auth@quant.com' },
        subject: 'Password reset request',
        bodyText: 'Action required: click here to verify your account and reset password.',
      });

      expect(classifyEmailCategory(securityEmail)).toBe('updates');
      expect(classifyEmailCategory(pwResetEmail)).toBe('updates');
    });

    it('prioritizes transactional updates even if unsubscribe link is in the email footer', () => {
      const invoiceWithFooter = createEmail({
        from: { email: 'accounting@saas.com' },
        subject: 'Monthly invoice #1084',
        bodyText: 'Here is your monthly invoice. If you wish to unsubscribe, click here.',
      });

      expect(classifyEmailCategory(invoiceWithFooter)).toBe('updates');
    });
  });

  describe('Promotions Category Classification', () => {
    it('classifies marketing and deal senders as promotions', () => {
      const promoEmail = createEmail({
        from: { email: 'promo@shopfashion.com' },
        subject: 'Weekend Flash Deals',
      });

      const marketingEmail = createEmail({
        from: { email: 'marketing@superstore.com' },
        subject: 'New arrivals just landed',
      });

      expect(classifyEmailCategory(promoEmail)).toBe('promotions');
      expect(classifyEmailCategory(marketingEmail)).toBe('promotions');
    });

    it('classifies discount, sale, promo, and coupon keywords as promotions', () => {
      const saleEmail = createEmail({
        from: { email: 'info@shoestore.com' },
        subject: 'Big Summer Sale: 50% discount on all items!',
        bodyText: 'Use promo code SUMMER50 at checkout for exclusive deal.',
      });

      const blackFridayEmail = createEmail({
        from: { email: 'deals@techoutlet.com' },
        subject: 'Black Friday preview: Save $100 today',
        bodyText: 'Limited time clearance event. View in browser. Unsubscribe.',
      });

      expect(classifyEmailCategory(saleEmail)).toBe('promotions');
      expect(classifyEmailCategory(blackFridayEmail)).toBe('promotions');
    });

    it('classifies newsletters with unsubscribe links as promotions', () => {
      const newsletter = createEmail({
        from: { email: 'editorial@dailydigest.com' },
        subject: 'Weekly Developer Newsletter #42',
        bodyText: 'Here are the top 10 articles of the week.\n\nTo opt-out, unsubscribe here.',
      });

      expect(classifyEmailCategory(newsletter)).toBe('promotions');
    });
  });

  describe('Social Category Classification', () => {
    it('classifies social network senders as social', () => {
      const fbEmail = createEmail({
        from: { email: 'notification@facebookmail.com' },
        subject: 'You have new notifications',
      });

      const twitterEmail = createEmail({
        from: { email: 'notify@twitter.com' },
        subject: 'New direct message on X',
      });

      const linkedinEmail = createEmail({
        from: { email: 'updates@linkedin.com' },
        subject: 'Sarah connected with you on LinkedIn',
      });

      const instaEmail = createEmail({
        from: { email: 'messages@instagram.com' },
        subject: 'Alex tagged you in a post',
      });

      const ytEmail = createEmail({
        from: { email: 'noreply@youtube.com' },
        subject: 'TechChannel uploaded a new video',
      });

      expect(classifyEmailCategory(fbEmail)).toBe('social');
      expect(classifyEmailCategory(twitterEmail)).toBe('social');
      expect(classifyEmailCategory(linkedinEmail)).toBe('social');
      expect(classifyEmailCategory(instaEmail)).toBe('social');
      expect(classifyEmailCategory(ytEmail)).toBe('social');
    });

    it('classifies social keywords in subject as social', () => {
      const followEmail = createEmail({
        from: { email: 'alerts@network.co' },
        subject: 'You have a new follower',
        bodyText: 'John Doe is now following you.',
      });

      const tagEmail = createEmail({
        from: { email: 'alerts@network.co' },
        subject: 'John tagged you in a story',
      });

      expect(classifyEmailCategory(followEmail)).toBe('social');
      expect(classifyEmailCategory(tagEmail)).toBe('social');
    });
  });

  describe('Forums Category Classification', () => {
    it('classifies mailing list headers as forums', () => {
      const mailingListEmail = createEmail({
        from: { email: 'dev@kernel.org' },
        subject: 'PATCH v3: mm/page_alloc optimization',
        headers: {
          'List-ID': '<linux-kernel.vger.kernel.org>',
          'List-Post': '<mailto:linux-kernel@vger.kernel.org>',
        },
      });

      expect(classifyEmailCategory(mailingListEmail)).toBe('forums');
    });

    it('classifies [group] or mailing list subject tags as forums', () => {
      const groupEmail = createEmail({
        from: { email: 'lead@quant.com' },
        subject: '[group] Weekly Tripartite Swarm Standup',
        bodyText: 'Here is the agenda for our synchronization meeting.',
      });

      const listEmail = createEmail({
        from: { email: 'moderator@python.org' },
        subject: '[python-dev] Weekly discussion digest',
      });

      expect(classifyEmailCategory(groupEmail)).toBe('forums');
      expect(classifyEmailCategory(listEmail)).toBe('forums');
    });

    it('classifies google-groups and discourse senders as forums', () => {
      const ggEmail = createEmail({
        from: { email: 'announcements@google-groups.com' },
        subject: 'Community Announcement #5',
      });

      const discourseEmail = createEmail({
        from: { email: 'notifications@discourse.subdomain.org' },
        subject: 'Summary of unread topics',
      });

      expect(classifyEmailCategory(ggEmail)).toBe('forums');
      expect(classifyEmailCategory(discourseEmail)).toBe('forums');
    });

    it('classifies isGroup flag as forums', () => {
      const flaggedGroupEmail = createEmail({
        from: { email: 'member@team.com' },
        subject: 'Team chat',
        isGroup: true,
      } as Partial<Email> & { subject: string; isGroup: boolean });

      expect(classifyEmailCategory(flaggedGroupEmail)).toBe('forums');
    });
  });

  describe('Thread-Level Categorization & Grouping', () => {
    const ME = 'kundan@quant.com';

    it('preserves updates category when user replies to a GitHub notification', () => {
      const incoming = createEmail({
        id: 'msg_1',
        from: { email: 'notifications@github.com', name: 'GitHub' },
        to: [{ email: ME }],
        subject: 'Issue #42: Bug in split inbox badges',
        bodyText: 'Please review this issue.',
        receivedAt: new Date('2026-09-25T10:00:00Z'),
      });

      const reply = createEmail({
        id: 'msg_2',
        from: { email: ME, name: 'Kundan' },
        to: [{ email: 'notifications@github.com' }],
        subject: 'Re: Issue #42: Bug in split inbox badges',
        bodyText: 'Looking into this now.',
        isSent: true,
        receivedAt: new Date('2026-09-25T10:05:00Z'),
      });

      const threads = groupEmailsIntoThreads([incoming, reply], ME);
      expect(threads).toHaveLength(1);
      expect(threads[0].category).toBe('updates');
    });

    it('preserves promotions category when user replies to vendor offer', () => {
      const incoming = createEmail({
        id: 'promo_1',
        from: { email: 'sales@vendor.com' },
        to: [{ email: ME }],
        subject: 'Special deal: 40% discount for enterprise licenses',
        bodyText: 'Limited time sale on developer licenses. Unsubscribe here.',
        receivedAt: new Date('2026-09-25T10:00:00Z'),
      });

      const reply = createEmail({
        id: 'promo_2',
        from: { email: ME },
        to: [{ email: 'sales@vendor.com' }],
        subject: 'Re: Special deal: 40% discount for enterprise licenses',
        bodyText: 'Can you send a formal quote for 15 seats?',
        isSent: true,
        receivedAt: new Date('2026-09-25T10:10:00Z'),
      });

      const threads = groupEmailsIntoThreads([incoming, reply], ME);
      expect(threads).toHaveLength(1);
      expect(threads[0].category).toBe('promotions');
    });

    it('respects server aiCategory on thread', () => {
      const threadCategory = classifyThreadCategory([], {
        aiCategory: 'updates',
      } as Email);

      expect(threadCategory).toBe('updates');
    });
  });

  describe('Live Count Calculation (computeSplitInboxCounts)', () => {
    const ME = 'kundan@quant.com';

    it('calculates unread and total counts accurately across all lenses', () => {
      const emails: Email[] = [
        // Primary: 2 threads (1 unread, 1 read)
        createEmail({
          from: { email: 'alice@company.com' },
          to: [{ email: ME }],
          subject: 'Design discussion',
          isRead: false,
        }),
        createEmail({
          from: { email: 'bob@company.com' },
          to: [{ email: ME }],
          subject: 'Lunch plan',
          isRead: true,
        }),

        // Updates: 3 threads (2 unread, 1 read)
        createEmail({
          from: { email: 'notifications@github.com' },
          to: [{ email: ME }],
          subject: '[PR #298] Sovereign Git Parity',
          isRead: false,
        }),
        createEmail({
          from: { email: 'billing@stripe.com' },
          to: [{ email: ME }],
          subject: 'Invoice #1092',
          isRead: false,
        }),
        createEmail({
          from: { email: 'service@paypal.com' },
          to: [{ email: ME }],
          subject: 'Payment receipt',
          isRead: true,
        }),

        // Promotions: 2 threads (1 unread, 1 read)
        createEmail({
          from: { email: 'marketing@store.com' },
          to: [{ email: ME }],
          subject: 'Exclusive deal: 50% discount',
          isRead: false,
        }),
        createEmail({
          from: { email: 'newsletter@tech.com' },
          to: [{ email: ME }],
          subject: 'Weekly newsletter - unsubscribe',
          isRead: true,
        }),

        // Social: 1 thread (1 unread)
        createEmail({
          from: { email: 'updates@linkedin.com' },
          to: [{ email: ME }],
          subject: 'Sarah connected with you on LinkedIn',
          isRead: false,
        }),

        // Forums: 1 thread (0 unread, 1 read)
        createEmail({
          from: { email: 'dev@python.org' },
          to: [{ email: ME }],
          subject: '[group] Core dev meeting',
          isRead: true,
        }),
      ];

      const threads = groupEmailsIntoThreads(emails, ME);
      const counts = computeSplitInboxCounts(threads);

      // Verify unread count badges match expectations
      expect(counts.primary).toBe(1);
      expect(counts.updates).toBe(2);
      expect(counts.promotions).toBe(1);
      expect(counts.social).toBe(1);
      expect(counts.forums).toBe(0);
      expect(counts.all).toBe(5);

      // Verify unread breakdown
      expect(counts.unread.primary).toBe(1);
      expect(counts.unread.updates).toBe(2);
      expect(counts.unread.promotions).toBe(1);
      expect(counts.unread.social).toBe(1);
      expect(counts.unread.forums).toBe(0);
      expect(counts.unread.all).toBe(5);

      // Verify total breakdown
      expect(counts.total.primary).toBe(2);
      expect(counts.total.updates).toBe(3);
      expect(counts.total.promotions).toBe(2);
      expect(counts.total.social).toBe(1);
      expect(counts.total.forums).toBe(1);
      expect(counts.total.all).toBe(9);
    });

    it('supports countMode: "total" to calculate total categorized thread distribution', () => {
      const emails: Email[] = [
        createEmail({
          from: { email: 'alice@company.com' },
          subject: 'Hello',
          isRead: true,
        }),
        createEmail({
          from: { email: 'notifications@github.com' },
          subject: 'Release v2.0',
          isRead: true,
        }),
        createEmail({
          from: { email: 'marketing@sale.com' },
          subject: 'Flash sale 70% off',
          isRead: true,
        }),
        createEmail({
          from: { email: 'notify@twitter.com' },
          subject: 'New follower',
          isRead: true,
        }),
      ];

      const threads = groupEmailsIntoThreads(emails);
      const counts = computeSplitInboxCounts(threads, { countMode: 'total' });

      expect(counts.primary).toBe(1);
      expect(counts.updates).toBe(1);
      expect(counts.promotions).toBe(1);
      expect(counts.social).toBe(1);
      expect(counts.all).toBe(4);
    });

    it('returns zero counts for empty conversation thread lists without crashing', () => {
      const counts = computeSplitInboxCounts([]);

      expect(counts.primary).toBe(0);
      expect(counts.updates).toBe(0);
      expect(counts.promotions).toBe(0);
      expect(counts.social).toBe(0);
      expect(counts.forums).toBe(0);
      expect(counts.all).toBe(0);
      expect(counts.total.all).toBe(0);
    });
  });
});
