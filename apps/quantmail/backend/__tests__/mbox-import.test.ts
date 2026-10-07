import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import emailsRoutes from '../routes/emails';
import { splitMbox, parseMbox, MboxParserService } from '../services/mbox-parser.service';

const SAMPLE_MBOX = `From alice@example.com Fri Sep 18 06:00:00 2026
Message-ID: <msg-001@example.com>
From: Alice Walker <alice@example.com>
To: Bob Smith <bob@quantmail.in>
Subject: Welcome to QuantMail
Date: Fri, 18 Sep 2026 06:00:00 +0000
Content-Type: text/plain; charset="utf-8"
X-Gmail-Labels: Important,Starred

Hello Bob,
Welcome to sovereign email!
>From your friend Alice.

From charlie@example.com Fri Sep 18 06:15:00 2026
Message-ID: <msg-002@example.com>
From: Charlie Brown <charlie@example.com>
To: Bob Smith <bob@quantmail.in>
Subject: Project Roadmap Update
Date: Fri, 18 Sep 2026 06:15:00 +0000
Content-Type: text/html; charset="utf-8"
X-Gmail-Labels: Sent

<p>Here is the roadmap update.</p>
`;

function createInMemoryPrisma() {
  const emails = new Map<string, any>();
  const folders = new Map<string, any>();

  return {
    email: {
      findMany: vi.fn(async ({ where }: any) => {
        const results: any[] = [];
        for (const e of emails.values()) {
          if (where?.userId && e.userId !== where.userId) continue;
          if (where?.messageId?.in && !where.messageId.in.includes(e.messageId)) continue;
          results.push(e);
        }
        return results;
      }),
      create: vi.fn(async ({ data }: any) => {
        const id = `email-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const record = { id, ...data };
        emails.set(id, record);
        return record;
      }),
    },
    emailFolder: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: `folder-${data.type}`, ...data })),
    },
    _stores: { emails, folders },
  };
}

describe('RFC 4155 MBOX Parser & Google Takeout Ingestion Engine (Task X02)', () => {
  describe('splitMbox & parseMbox unit mechanics', () => {
    it('splits mbox stream by From_ line delimiter into individual messages', () => {
      const messages = splitMbox(SAMPLE_MBOX);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toContain('Subject: Welcome to QuantMail');
      expect(messages[1]).toContain('Subject: Project Roadmap Update');
    });

    it('unescapes RFC 4155 >From lines back to From', () => {
      const messages = splitMbox(SAMPLE_MBOX);
      expect(messages[0]).toContain('From your friend Alice.');
      expect(messages[0]).not.toContain('>From your friend Alice.');
    });

    it('respects maxMessages ceiling to prevent memory denial-of-service', () => {
      const messages = splitMbox(SAMPLE_MBOX, 1);
      expect(messages).toHaveLength(1);
    });

    it('parses structured MIME headers and content from split messages', () => {
      const parsed = parseMbox(SAMPLE_MBOX);
      expect(parsed).toHaveLength(2);

      const first = parsed[0];
      expect(first.messageId).toBe('msg-001@example.com');
      expect(first.fromAddress).toBe('alice@example.com');
      expect(first.fromName).toBe('Alice Walker');
      expect(first.subject).toBe('Welcome to QuantMail');
      expect(first.bodyPlain).toContain('Welcome to sovereign email!');
      expect(first.headers['x-gmail-labels']).toBe('Important,Starred');

      const second = parsed[1];
      expect(second.messageId).toBe('msg-002@example.com');
      expect(second.fromAddress).toBe('charlie@example.com');
      expect(second.bodyHtml).toContain('<p>Here is the roadmap update.</p>');
    });
  });

  describe('MboxParserService database ingestion & deduplication', () => {
    it('imports parsed messages into Prisma and tags labels correctly', async () => {
      const prisma = createInMemoryPrisma();
      const service = new MboxParserService(prisma);

      const result = await service.importMbox('user-1', SAMPLE_MBOX);
      expect(result.totalFound).toBe(2);
      expect(result.importedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.messageIds).toEqual(['msg-001@example.com', 'msg-002@example.com']);

      const stored = Array.from(prisma._stores.emails.values());
      expect(stored).toHaveLength(2);
      expect(stored[0].isImportant).toBe(true);
      expect(stored[0].isStarred).toBe(true);
      expect(stored[1].isSent).toBe(true);
    });

    it('deduplicates against existing messages with same messageId (idempotent)', async () => {
      const prisma = createInMemoryPrisma();
      const service = new MboxParserService(prisma);

      // First import
      await service.importMbox('user-1', SAMPLE_MBOX);

      // Second import with same mbox
      const secondResult = await service.importMbox('user-1', SAMPLE_MBOX);
      expect(secondResult.totalFound).toBe(2);
      expect(secondResult.importedCount).toBe(0);
      expect(secondResult.skippedCount).toBe(2);

      // Store still contains exactly 2 emails
      expect(prisma._stores.emails.size).toBe(2);
    });

    it('rejects oversized payloads exceeding 10MB limit', async () => {
      const prisma = createInMemoryPrisma();
      const service = new MboxParserService(prisma);
      const oversized = 'A'.repeat(10 * 1024 * 1024 + 10);

      await expect(service.importMbox('user-1', oversized)).rejects.toMatchObject({
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    });
  });

  describe('POST /emails/import/mbox Fastify Route Injection', () => {
    let app: FastifyInstance;
    let prisma: ReturnType<typeof createInMemoryPrisma>;

    beforeEach(async () => {
      prisma = createInMemoryPrisma();
      app = Fastify();
      await app.register(errorHandlerPlugin);
      (app as any).prisma = prisma;

      // Mock auth decorator
      app.addHook('onRequest', async (req) => {
        (req as any).auth = { userId: 'user-1' };
      });

      await app.register(emailsRoutes, { prefix: '/emails' });
      await app.ready();
    });

    it('imports mbox via JSON payload and returns status 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/emails/import/mbox',
        payload: {
          mboxData: SAMPLE_MBOX,
          folder: 'inbox',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.totalFound).toBe(2);
      expect(body.data.importedCount).toBe(2);
    });

    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const unauthApp = Fastify();
      await unauthApp.register(errorHandlerPlugin);
      (unauthApp as any).prisma = prisma;
      await unauthApp.register(emailsRoutes, { prefix: '/emails' });
      await unauthApp.ready();

      const res = await unauthApp.inject({
        method: 'POST',
        url: '/emails/import/mbox',
        payload: {
          mboxData: SAMPLE_MBOX,
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
