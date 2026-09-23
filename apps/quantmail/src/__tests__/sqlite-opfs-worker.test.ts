import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalDbService } from '../services/local-db.js';
import { EmailRecord } from '../workers/fts-schema.js';

describe('Task W35-01: SQLite FTS5 Wasm OPFS in WebWorker', () => {
  let db: LocalDbService;

  beforeEach(async () => {
    db = new LocalDbService();
    await db.init('test_mailbox.db');
  });

  afterEach(async () => {
    await db.clear();
    db.destroy();
  });

  it('initializes local db service and reports storage stats', async () => {
    expect(db.isReady()).toBe(true);
    const stats = await db.getStats();
    expect(stats.initialized).toBe(true);
    expect(stats.size).toBe(0);
    expect(['opfs', 'memory']).toContain(stats.storage);
  });

  it('indexes batch of emails and verifies indexed count', async () => {
    const sampleEmails: EmailRecord[] = [
      {
        id: 'msg_001',
        thread_id: 'th_001',
        sender: 'alice@quant.local',
        recipient: 'bob@quant.local',
        subject: 'Q3 Financial Review & Roadmap',
        snippet: 'Here is the detailed breakdown of the Q3 earnings and projections for next year.',
        date: Date.now() - 10000,
        folder: 'INBOX',
        read: 1,
        starred: 1,
      },
      {
        id: 'msg_002',
        thread_id: 'th_002',
        sender: 'security@github.com',
        recipient: 'bob@quant.local',
        subject: 'Security Alert: New SSH key added to account',
        snippet: 'A new personal public key was added to your profile from IP 192.0.2.1.',
        date: Date.now() - 5000,
        folder: 'INBOX',
        read: 0,
        starred: 0,
      },
      {
        id: 'msg_003',
        thread_id: 'th_003',
        sender: 'newsletter@investing.com',
        recipient: 'bob@quant.local',
        subject: 'Weekly Market Briefing',
        snippet: 'Stocks rally as inflation prints lower than central bank estimates.',
        date: Date.now(),
        folder: 'PROMOTIONS',
        read: 0,
        starred: 0,
      },
    ];

    const indexRes = await db.indexEmails(sampleEmails);
    expect(indexRes.count).toBe(3);
    expect(indexRes.totalIndexed).toBe(3);

    const stats = await db.getStats();
    expect(stats.size).toBe(3);
  });

  it('executes fast full-text search with snippet highlights', async () => {
    const sampleEmails: EmailRecord[] = [
      {
        id: 'msg_invoice_1',
        thread_id: 'th_101',
        sender: 'billing@stripe.com',
        recipient: 'founder@quantmail.in',
        subject: 'Invoice #1042 paid successfully',
        snippet: 'Thank you for your payment of $499.00 for Quant Cloud Enterprise.',
        date: 1700000000,
        folder: 'INBOX',
        read: 1,
        starred: 0,
      },
      {
        id: 'msg_invoice_2',
        thread_id: 'th_102',
        sender: 'support@aws.amazon.com',
        recipient: 'founder@quantmail.in',
        subject: 'AWS Monthly Billing Statement',
        snippet: 'Your invoice for AWS services rendered in September is now available online.',
        date: 1700001000,
        folder: 'ARCHIVE',
        read: 0,
        starred: 0,
      },
    ];

    await db.indexEmails(sampleEmails);

    const searchRes = await db.search('invoice');
    expect(searchRes.totalCount).toBe(2);
    expect(searchRes.results[0].subject.toLowerCase()).toContain('invoice');
    expect(searchRes.results.some((r) => r.snippet.toLowerCase().includes('invoice'))).toBe(true);
  });

  it('updates email read and starred flags in local index', async () => {
    const email: EmailRecord = {
      id: 'msg_flag_test',
      thread_id: 'th_201',
      sender: 'hr@quant.local',
      recipient: 'bob@quant.local',
      subject: 'Holiday schedule update',
      snippet: 'Please note the upcoming company holidays for the calendar year.',
      date: 1700002000,
      folder: 'INBOX',
      read: 0,
      starred: 0,
    };

    await db.indexEmails([email]);

    await db.updateFlags('msg_flag_test', { read: 1, starred: 1 });

    const searchRes = await db.search('holiday');
    expect(searchRes.results.length).toBe(1);
    expect(searchRes.results[0].read).toBe(1);
    expect(searchRes.results[0].starred).toBe(1);
  });

  it('deletes an email from the local index', async () => {
    const email: EmailRecord = {
      id: 'msg_to_delete',
      thread_id: 'th_301',
      sender: 'spam@promo.com',
      recipient: 'bob@quant.local',
      subject: 'Claim your instant prize now',
      snippet: 'Click this link immediately to receive a $500 gift card.',
      date: 1700003000,
      folder: 'SPAM',
      read: 0,
      starred: 0,
    };

    await db.indexEmails([email]);
    let stats = await db.getStats();
    expect(stats.size).toBe(1);

    const deleted = await db.deleteEmail('msg_to_delete');
    expect(deleted).toBe(true);

    stats = await db.getStats();
    expect(stats.size).toBe(0);

    const searchRes = await db.search('prize');
    expect(searchRes.totalCount).toBe(0);
  });
});
