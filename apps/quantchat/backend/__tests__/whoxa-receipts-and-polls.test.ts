import { describe, it, expect } from 'vitest';
import { ReceiptService } from '../services/receipt.service';
import { PollService } from '../services/poll.service';

describe('Whoxa Receipts & Polls Engine', () => {
  it('marks message delivered and returns delivered status', async () => {
    const fakeRows = new Map<string, any>();
    const fakePrisma = {
      messageDelivery: {
        async findUnique({ where }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          return fakeRows.get(k) || null;
        },
        async upsert({ where, create, update }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          const existing = fakeRows.get(k);
          const row = existing
            ? { ...existing, ...update }
            : {
                messageId: where.messageId_userId.messageId,
                userId: where.messageId_userId.userId,
                deliveredAt: create.deliveredAt || new Date(),
                readAt: create.readAt || null,
              };
          fakeRows.set(k, row);
          return row;
        },
        async findMany({ where }: any) {
          const results: any[] = [];
          for (const row of fakeRows.values()) {
            if (row.messageId === where.messageId) {
              results.push(row);
            }
          }
          return results;
        },
      },
    };

    const receiptService = new ReceiptService(fakePrisma as any);

    const deliveredRes = await receiptService.markMessageDelivered('msg_101', 'user_alice');
    expect(deliveredRes.status).toBe('delivered');
    expect(deliveredRes.deliveredAt).toBeTypeOf('string');

    const status = await receiptService.getMessageReceiptStatus('msg_101', 'user_sender');
    expect(status.status).toBe('delivered');
    expect(status.receipts).toHaveLength(1);
    expect(status.receipts[0].userId).toBe('user_alice');
    expect(status.receipts[0].status).toBe('delivered');
  });

  it('marks message read and aggregates status as read (double blue ticks)', async () => {
    const fakeRows = new Map<string, any>();
    const fakePrisma = {
      messageDelivery: {
        async findUnique({ where }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          return fakeRows.get(k) || null;
        },
        async upsert({ where, create, update }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          const existing = fakeRows.get(k);
          const row = existing
            ? { ...existing, ...update }
            : {
                messageId: where.messageId_userId.messageId,
                userId: where.messageId_userId.userId,
                deliveredAt: create.deliveredAt || new Date(),
                readAt: create.readAt || null,
              };
          fakeRows.set(k, row);
          return row;
        },
        async findMany({ where }: any) {
          const results: any[] = [];
          for (const row of fakeRows.values()) {
            if (row.messageId === where.messageId) {
              results.push(row);
            }
          }
          return results;
        },
      },
    };

    const receiptService = new ReceiptService(fakePrisma as any);

    await receiptService.markMessageDelivered('msg_102', 'user_bob');
    const readRes = await receiptService.markMessageRead('msg_102', 'user_bob');
    expect(readRes.status).toBe('read');
    expect(readRes.readAt).toBeTypeOf('string');

    const status = await receiptService.getMessageReceiptStatus('msg_102', 'user_sender');
    expect(status.status).toBe('read');
    expect(status.receipts[0].status).toBe('read');
  });

  it('tests group receipt aggregation (read by all vs some)', async () => {
    const fakeRows = new Map<string, any>();
    const fakePrisma = {
      messageDelivery: {
        async findUnique({ where }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          return fakeRows.get(k) || null;
        },
        async upsert({ where, create, update }: any) {
          const k = `${where.messageId_userId.messageId}::${where.messageId_userId.userId}`;
          const existing = fakeRows.get(k);
          const row = existing
            ? { ...existing, ...update }
            : {
                messageId: where.messageId_userId.messageId,
                userId: where.messageId_userId.userId,
                deliveredAt: create.deliveredAt || new Date(),
                readAt: create.readAt || null,
              };
          fakeRows.set(k, row);
          return row;
        },
        async findMany({ where }: any) {
          const results: any[] = [];
          for (const row of fakeRows.values()) {
            if (row.messageId === where.messageId) {
              results.push(row);
            }
          }
          return results;
        },
      },
    };

    const receiptService = new ReceiptService(fakePrisma as any);

    // Group chat: User A delivered, User B read
    await receiptService.markMessageDelivered('msg_group_1', 'user_a');
    await receiptService.markMessageRead('msg_group_1', 'user_b');

    const status = await receiptService.getMessageReceiptStatus('msg_group_1', 'sender');
    // Since at least one read, overall status is 'read'
    expect(status.status).toBe('read');
    expect(status.receipts).toHaveLength(2);
    const userARec = status.receipts.find((r) => r.userId === 'user_a');
    const userBRec = status.receipts.find((r) => r.userId === 'user_b');
    expect(userARec?.status).toBe('delivered');
    expect(userBRec?.status).toBe('read');
  });

  it('tests poll creation, voting, multiple votes handling, and percentage calculation', async () => {
    const pollService = new PollService();

    // 1. Create poll
    const poll = await pollService.createPoll('chat_1', 'creator_1', {
      question: 'What is your favorite stack?',
      options: ['TypeScript', 'Python', 'Go'],
      allowMultiple: false,
    });

    expect(poll.id).toBeDefined();
    expect(poll.question).toBe('What is your favorite stack?');
    expect(poll.options).toHaveLength(3);

    // 2. Vote on poll
    await pollService.votePoll(poll.id, 'user_1', 0); // TypeScript
    await pollService.votePoll(poll.id, 'user_2', 0); // TypeScript
    await pollService.votePoll(poll.id, 'user_3', 1); // Python

    let results = await pollService.getPollResults(poll.id);
    expect(results.totalVotes).toBe(3);
    expect(results.options[0].votes).toBe(2); // 2 votes for TypeScript
    expect(results.options[0].percentage).toBe(66.67); // 2/3 = 66.67%
    expect(results.options[1].votes).toBe(1); // 1 vote for Python
    expect(results.options[1].percentage).toBe(33.33); // 1/3 = 33.33%

    // 3. Single choice replacement test: user_3 changes vote from Python (1) to Go (2)
    await pollService.votePoll(poll.id, 'user_3', 2);
    results = await pollService.getPollResults(poll.id);
    expect(results.totalVotes).toBe(3);
    expect(results.options[1].votes).toBe(0);
    expect(results.options[2].votes).toBe(1);

    // 4. Multiple choice poll test
    const multiPoll = await pollService.createPoll('chat_1', 'creator_1', {
      question: 'Select all you use',
      options: ['React', 'Node', 'Docker'],
      allowMultiple: true,
    });

    await pollService.votePoll(multiPoll.id, 'user_1', 0);
    await pollService.votePoll(multiPoll.id, 'user_1', 1); // user_1 votes for React and Node
    const multiResults = await pollService.getPollResults(multiPoll.id);
    expect(multiResults.totalVotes).toBe(2);
    expect(multiResults.options[0].votes).toBe(1);
    expect(multiResults.options[1].votes).toBe(1);
    expect(multiResults.options[0].voters).toContain('user_1');
  });
});
