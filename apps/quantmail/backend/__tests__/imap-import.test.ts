// @vitest-environment node
// ============================================================================
// Phase X: IMAP Mailbox & Thread Ingestion Engine Test Suite (Task X01)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { IMAPBridge } from '@quant/federation';
import emailsRoutes from '../routes/emails';
import {
  ImapImporterService,
  normalizeSubject,
  resetImapJobStores,
} from '../services/imap-importer.service';

describe('Phase X: IMAP Mailbox & Thread Ingestion (Task X01)', () => {
  beforeEach(() => {
    resetImapJobStores();
    vi.clearAllMocks();
  });

  describe('normalizeSubject utility', () => {
    it('strips single Re: prefix', () => {
      expect(normalizeSubject('Re: Q3 Financial Report')).toBe('Q3 Financial Report');
    });

    it('strips nested Re: and Fwd: prefixes', () => {
      expect(normalizeSubject('Re: Fwd: re: FW: Project Roadmap')).toBe('Project Roadmap');
    });

    it('preserves subject when no prefix exists', () => {
      expect(normalizeSubject('Welcome to QuantMail')).toBe('Welcome to QuantMail');
    });

    it('handles empty or undefined subject gracefully', () => {
      expect(normalizeSubject('')).toBe('');
    });
  });

  describe('ImapImporterService', () => {
    it('successfully imports messages from IMAP bridge and groups into threads', async () => {
      const createdEmails: any[] = [];
      const prismaMock = {
        email: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }) => {
            createdEmails.push(data);
            return { id: `email_${createdEmails.length}`, ...data };
          }),
        },
      };

      const bridge = new IMAPBridge();
      bridge.connect({
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        username: 'ceo@quant.app',
        password: 'secret-password',
      });

      // Inject 2 related messages with Re: and 1 separate message
      const messagesMap = (bridge as any).messages as Map<string, any[]>;
      messagesMap.set('INBOX', [
        {
          uid: 1,
          flags: ['\\Seen'],
          subject: 'Sovereign Swarm Architecture',
          from: 'astra@quant.app',
          to: 'ceo@quant.app',
          date: '2026-09-18T08:00:00.000Z',
          body: 'Here is the draft for Wave 24 and Wave 25.',
          size: 1024,
        },
        {
          uid: 2,
          flags: [],
          subject: 'Re: Sovereign Swarm Architecture',
          from: 'ceo@quant.app',
          to: 'astra@quant.app',
          date: '2026-09-18T08:15:00.000Z',
          body: 'Approved, proceed with autonomous execution.',
          size: 512,
        },
        {
          uid: 3,
          flags: ['\\Flagged'],
          subject: 'Platform Performance Benchmarks',
          from: 'dev2@quant.app',
          to: 'ceo@quant.app',
          date: '2026-09-18T08:30:00.000Z',
          body: 'All test suites passing in under 45 seconds.',
          size: 2048,
        },
      ]);

      const service = new ImapImporterService(prismaMock);
      const result = await service.importFromImap(
        'user-123',
        {
          host: 'imap.gmail.com',
          username: 'ceo@quant.app',
          mailbox: 'INBOX',
        },
        bridge,
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.totalFound).toBe(3);
      expect(result.importedCount).toBe(3);
      expect(result.skippedCount).toBe(0);
      expect(result.threadsCreated).toBe(2); // 1 thread for "Sovereign Swarm Architecture", 1 for "Platform Performance Benchmarks"

      expect(createdEmails.length).toBe(3);
      // Both "Sovereign Swarm Architecture" and "Re: Sovereign Swarm Architecture" must share the same threadId
      expect(createdEmails[0].threadId).toBe(createdEmails[1].threadId);
      // "Platform Performance Benchmarks" must have a different threadId
      expect(createdEmails[2].threadId).not.toBe(createdEmails[0].threadId);

      // Verify job status tracking
      const jobState = service.getJobStatus(result.jobId);
      expect(jobState).toBeDefined();
      expect(jobState?.status).toBe('COMPLETED');
      expect(jobState?.total).toBe(3);
    });

    it('idempotently deduplicates messages already present in the database', async () => {
      const bridge = new IMAPBridge();
      bridge.connect({
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        username: 'user@quant.app',
        password: 'pass',
      });

      const messagesMap = (bridge as any).messages as Map<string, any[]>;
      messagesMap.set('INBOX', [
        {
          uid: 10,
          flags: ['\\Seen'],
          subject: 'Weekly Digest',
          from: 'news@quant.app',
          to: 'user@quant.app',
          date: '2026-09-18T07:00:00.000Z',
          body: 'Here is your weekly recap.',
          size: 256,
        },
      ]);

      const prismaMock = {
        email: {
          // Simulate message already existing
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            return [{ messageId: where.messageId.in[0] }];
          }),
          create: vi.fn(),
        },
      };

      const service = new ImapImporterService(prismaMock);
      const result = await service.importFromImap(
        'user-123',
        {
          host: 'imap.gmail.com',
          username: 'user@quant.app',
        },
        bridge,
      );

      expect(result.totalFound).toBe(1);
      expect(result.importedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(prismaMock.email.create).not.toHaveBeenCalled();
    });
  });

  describe('Fastify IMAP Import Routes', () => {
    let app: FastifyInstance;
    let authUser: { userId: string } | null = { userId: 'test-user-id' };

    beforeEach(async () => {
      authUser = { userId: 'test-user-id' };
      app = Fastify();
      app.addHook('preHandler', async (req) => {
        if (authUser) {
          (req as unknown as { auth: { userId: string } }).auth = authUser;
        }
      });

      const prismaMock = {
        email: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'email-1' }),
        },
      };

      app.decorate('prisma', prismaMock as never);
      await app.register(emailsRoutes);
      await app.ready();
    });

    it('rejects unauthenticated requests to POST /import/imap with 401', async () => {
      authUser = null;
      const res = await app.inject({
        method: 'POST',
        url: '/import/imap',
        payload: {
          host: 'imap.gmail.com',
          username: 'user@quant.app',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid payload missing required host and username with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/import/imap',
        payload: {
          port: 993,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.message || json.error).toBeDefined();
    });

    it('successfully processes POST /import/imap and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/import/imap',
        payload: {
          host: 'imap.gmail.com',
          port: 993,
          tls: true,
          username: 'user@quant.app',
          password: 'secure-password',
          mailbox: 'INBOX',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBeDefined();
      expect(json.data.status).toBe('COMPLETED');

      // Test status route
      const statusRes = await app.inject({
        method: 'GET',
        url: `/import/imap/status/${json.data.jobId}`,
      });

      expect(statusRes.statusCode).toBe(200);
      const statusJson = statusRes.json();
      expect(statusJson.success).toBe(true);
      expect(statusJson.data.jobId).toBe(json.data.jobId);
      expect(statusJson.data.status).toBe('COMPLETED');
    });

    it('returns 404 for nonexistent job on GET /import/imap/status/:jobId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/import/imap/status/nonexistent-job-id',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
