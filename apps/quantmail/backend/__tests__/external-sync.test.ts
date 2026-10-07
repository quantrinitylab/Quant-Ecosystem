// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalSyncService, type ExternalAccountConfig } from '../services/external-sync.service';
import { IMAPBridge } from '@quant/federation';

describe('ExternalSyncService (Task QM-05: External IMAP/POP3 Sync Worker)', () => {
  let service: ExternalSyncService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      emailFolder: {
        findFirst: vi.fn().mockImplementation((args: any) => {
          return Promise.resolve({
            id: `folder-${args.where.type.toLowerCase()}`,
            type: args.where.type,
          });
        }),
      },
      email: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockImplementation((args: any) =>
            Promise.resolve({ id: 'imported-email-1', ...args.data }),
          ),
      },
      thread: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'thread-new-1' }),
      },
    };
    service = new ExternalSyncService(mockPrisma);
  });

  it('tests connection to external IMAP provider and returns mailboxes', async () => {
    const config: ExternalAccountConfig = {
      userId: 'user-1',
      provider: 'gmail',
      email: 'user@gmail.com',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      username: 'user@gmail.com',
      password: 'app-password-secret',
    };

    const result = await service.testConnection(config);
    expect(result.success).toBe(true);
    expect(result.mailboxes).toContain('INBOX');
    expect(result.mailboxes).toContain('Sent');
  });

  it('synchronizes messages from external mailboxes and tracks progress', async () => {
    const mockBridge = new IMAPBridge();
    mockBridge.connect({
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      username: 'user@gmail.com',
      password: 'password',
    });

    // Populate some remote messages in the bridge
    (mockBridge as any).messages.set('INBOX', [
      {
        uid: 101,
        flags: ['\\Seen'],
        subject: 'Welcome to Gmail',
        from: 'google@gmail.com',
        to: 'user@gmail.com',
        date: new Date().toISOString(),
        body: 'Welcome to your Google account',
        size: 512,
      },
      {
        uid: 102,
        flags: ['\\Flagged'],
        subject: 'Tax Invoice 2026',
        from: 'billing@service.com',
        to: 'user@gmail.com',
        date: new Date().toISOString(),
        body: 'Your invoice is attached',
        size: 1024,
      },
    ]);

    const config: ExternalAccountConfig = {
      userId: 'user-1',
      provider: 'gmail',
      email: 'user@gmail.com',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      username: 'user@gmail.com',
      password: 'password',
      syncMailboxes: ['INBOX'],
    };

    const job = await service.startSync(config, mockBridge);
    expect(job.jobId).toBeDefined();
    expect(job.userId).toBe('user-1');

    // Wait a brief tick for async worker
    await new Promise((r) => setTimeout(r, 50));

    const status = service.getSyncStatus('user-1', job.jobId);
    expect(status?.state).toBe('completed');
    expect(status?.totalFound).toBe(2);
    expect(status?.totalSynced).toBe(2);
    expect(mockPrisma.email.create).toHaveBeenCalledTimes(2);
  });

  it('deduplicates previously imported messages', async () => {
    const mockBridge = new IMAPBridge();
    mockBridge.connect({
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      username: 'user@gmail.com',
      password: 'password',
    });

    (mockBridge as any).messages.set('INBOX', [
      {
        uid: 201,
        flags: [],
        subject: 'Existing Message',
        from: 'old@example.com',
        to: 'user@gmail.com',
        date: new Date().toISOString(),
        body: 'Already imported',
        size: 256,
      },
    ]);

    // Mock that message already exists in DB
    mockPrisma.email.findFirst.mockResolvedValue({ id: 'already-imported-id' });

    const config: ExternalAccountConfig = {
      userId: 'user-1',
      provider: 'gmail',
      email: 'user@gmail.com',
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      username: 'user@gmail.com',
      password: 'password',
      syncMailboxes: ['INBOX'],
    };

    const job = await service.startSync(config, mockBridge);
    await new Promise((r) => setTimeout(r, 50));

    const status = service.getSyncStatus('user-1', job.jobId);
    expect(status?.state).toBe('completed');
    expect(status?.totalFound).toBe(1);
    expect(status?.totalSynced).toBe(0);
    expect(status?.totalDuplicates).toBe(1);
    expect(mockPrisma.email.create).not.toHaveBeenCalled();
  });

  it('allows canceling an ongoing sync job', async () => {
    const config: ExternalAccountConfig = {
      userId: 'user-2',
      provider: 'outlook',
      email: 'user@outlook.com',
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      username: 'user@outlook.com',
      password: 'password',
    };

    const job = await service.startSync(config);
    const canceled = service.cancelSync('user-2', job.jobId);
    expect(canceled).toBe(true);

    const status = service.getSyncStatus('user-2', job.jobId);
    expect(status?.state).toBe('aborted');
  });
});
