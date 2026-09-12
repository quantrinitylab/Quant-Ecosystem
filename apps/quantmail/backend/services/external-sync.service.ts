// ============================================================================
// QuantMail — External IMAP/POP3 Mailbox Sync & Migration Worker (Task QM-05)
//
// Connects to external email providers (Gmail, Outlook, Yahoo, Custom IMAP/POP3),
// maps remote folders to local QuantMail folders, and imports messages with
// deduplication, progress tracking, and batch processing.
// ============================================================================
import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { IMAPBridge, type IMAPConfig, type BridgeMessage } from '@quant/federation';

export type ExternalProvider = 'gmail' | 'outlook' | 'yahoo' | 'custom_imap' | 'pop3';

export interface ExternalAccountConfig {
  id?: string;
  userId: string;
  provider: ExternalProvider;
  email: string;
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password?: string;
  accessToken?: string;
  syncMailboxes?: string[];
}

export interface SyncJobStatus {
  jobId: string;
  userId: string;
  provider: ExternalProvider;
  email: string;
  state: 'pending' | 'connecting' | 'syncing' | 'completed' | 'failed' | 'aborted';
  totalFound: number;
  totalSynced: number;
  totalDuplicates: number;
  currentMailbox: string | null;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface ExternalSyncPrismaClient {
  emailFolder: {
    findFirst(args: any): Promise<{ id: string; type: string } | null>;
  };
  email: {
    findFirst(args: any): Promise<{ id: string } | null>;
    create(args: any): Promise<any>;
  };
  thread: {
    findFirst(args: any): Promise<{ id: string } | null>;
    create(args: any): Promise<{ id: string }>;
  };
}

export const PROVIDER_PRESETS: Record<string, { host: string; port: number; tls: boolean }> = {
  gmail: { host: 'imap.gmail.com', port: 993, tls: true },
  outlook: { host: 'outlook.office365.com', port: 993, tls: true },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993, tls: true },
};

export class ExternalSyncService {
  private activeJobs = new Map<string, SyncJobStatus>();

  constructor(private readonly prisma: ExternalSyncPrismaClient) {}

  /**
   * Tests the connection to an external IMAP provider.
   */
  async testConnection(
    config: ExternalAccountConfig,
  ): Promise<{ success: boolean; mailboxes: string[] }> {
    const bridge = new IMAPBridge();
    const connected = bridge.connect({
      host: config.host,
      port: config.port,
      tls: config.tls,
      username: config.username,
      password: config.password ?? 'oauth_token',
    });

    if (!connected) {
      throw createAppError(
        'Failed to connect to external IMAP server. Check host, port, and credentials.',
        400,
        'IMAP_CONNECTION_FAILED',
      );
    }

    const mailboxes = bridge.listMailboxes().map((m) => m.name);
    return { success: true, mailboxes };
  }

  /**
   * Starts a sync / migration job from the external mailbox into QuantMail.
   */
  async startSync(
    config: ExternalAccountConfig,
    injectedBridge?: IMAPBridge,
  ): Promise<SyncJobStatus> {
    const existingJob = Array.from(this.activeJobs.values()).find(
      (j) => j.userId === config.userId && (j.state === 'syncing' || j.state === 'connecting'),
    );
    if (existingJob) {
      throw createAppError(
        'A sync job is already in progress for this user',
        409,
        'SYNC_IN_PROGRESS',
      );
    }

    const jobId = randomUUID();
    const status: SyncJobStatus = {
      jobId,
      userId: config.userId,
      provider: config.provider,
      email: config.email,
      state: 'connecting',
      totalFound: 0,
      totalSynced: 0,
      totalDuplicates: 0,
      currentMailbox: null,
      startedAt: new Date(),
    };

    this.activeJobs.set(jobId, status);

    // Run synchronization worker
    this.runSyncWorker(jobId, config, injectedBridge).catch((err) => {
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.state = 'failed';
        job.errorMessage = err instanceof Error ? err.message : String(err);
        job.completedAt = new Date();
      }
    });

    return status;
  }

  /**
   * Returns current sync job status for the user.
   */
  getSyncStatus(userId: string, jobId?: string): SyncJobStatus | null {
    if (jobId) {
      const job = this.activeJobs.get(jobId);
      return job && job.userId === userId ? job : null;
    }
    const userJobs = Array.from(this.activeJobs.values()).filter((j) => j.userId === userId);
    if (!userJobs.length) return null;
    return userJobs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null;
  }

  /**
   * Cancels/aborts an ongoing sync job.
   */
  cancelSync(userId: string, jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (job && job.userId === userId && (job.state === 'syncing' || job.state === 'connecting')) {
      job.state = 'aborted';
      job.completedAt = new Date();
      return true;
    }
    return false;
  }

  private async runSyncWorker(
    jobId: string,
    config: ExternalAccountConfig,
    injectedBridge?: IMAPBridge,
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const bridge = injectedBridge ?? new IMAPBridge();
    if (!injectedBridge) {
      const connected = bridge.connect({
        host: config.host,
        port: config.port,
        tls: config.tls,
        username: config.username,
        password: config.password ?? 'oauth_token',
      });

      if (!connected) {
        job.state = 'failed';
        job.errorMessage = 'Could not authenticate to remote IMAP server';
        job.completedAt = new Date();
        return;
      }
    }

    job.state = 'syncing';

    const remoteMailboxes = bridge.listMailboxes();
    const targetMailboxes = config.syncMailboxes?.length
      ? remoteMailboxes.filter((m) => config.syncMailboxes!.includes(m.name))
      : remoteMailboxes;

    for (const mailbox of targetMailboxes) {
      if ((job.state as string) === 'aborted') break;
      job.currentMailbox = mailbox.name;

      // Map remote mailbox name to QuantMail folder type
      const localFolderType = this.mapFolderType(mailbox.name);
      const folder = await this.prisma.emailFolder.findFirst({
        where: { userId: config.userId, type: localFolderType },
      });
      const folderId = folder?.id ?? '';

      // Fetch messages from remote mailbox
      const messages: BridgeMessage[] = bridge.fetchMessages(mailbox.name, {
        start: 1,
        end: Math.max(1000, mailbox.exists),
      });

      job.totalFound += messages.length;

      for (const msg of messages) {
        if ((job.state as string) === 'aborted') break;

        const syntheticMessageId = `<${config.email}-${msg.uid}@external-sync.quantmail.in>`;
        const existing = await this.prisma.email.findFirst({
          where: { userId: config.userId, messageId: syntheticMessageId },
        });

        if (existing) {
          job.totalDuplicates++;
          continue;
        }

        // Create or find a thread for imported message
        let thread = await this.prisma.thread.findFirst({
          where: { userId: config.userId, subject: msg.subject },
        });
        if (!thread) {
          thread = await this.prisma.thread.create({
            data: {
              userId: config.userId,
              subject: msg.subject,
              participants: [msg.from, msg.to],
              snippet: (msg.body ?? msg.subject).slice(0, 200),
            },
          });
        }

        const isRead = msg.flags.includes('\\Seen');
        const isStarred = msg.flags.includes('\\Flagged');

        await this.prisma.email.create({
          data: {
            userId: config.userId,
            folderId,
            threadId: thread.id,
            messageId: syntheticMessageId,
            fromAddress: msg.from,
            toAddresses: [msg.to],
            ccAddresses: [],
            bccAddresses: [],
            subject: msg.subject,
            bodyPlain: msg.body ?? '',
            bodyHtml: msg.body ? `<p>${msg.body}</p>` : '',
            snippet: (msg.body ?? '').slice(0, 200),
            isRead,
            isStarred,
            isSpam: localFolderType === 'SPAM',
            receivedAt: new Date(msg.date),
            deliveryStatus: 'delivered',
          },
        });

        job.totalSynced++;
      }
    }

    if ((job.state as string) !== 'aborted') {
      job.state = 'completed';
      job.currentMailbox = null;
      job.completedAt = new Date();
    }
  }

  private mapFolderType(remoteName: string): string {
    const lower = remoteName.toLowerCase();
    if (lower.includes('inbox')) return 'INBOX';
    if (lower.includes('sent')) return 'SENT';
    if (lower.includes('draft')) return 'DRAFTS';
    if (lower.includes('trash') || lower.includes('bin') || lower.includes('deleted'))
      return 'TRASH';
    if (lower.includes('spam') || lower.includes('junk')) return 'SPAM';
    if (lower.includes('archive')) return 'ARCHIVE';
    return 'CUSTOM';
  }
}
