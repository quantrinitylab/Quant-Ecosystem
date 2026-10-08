// ============================================================================
// Quanty agent — mail tools ("hands" for email)
// ============================================================================
//
// PURPOSE
//   Concrete, backend-backed tools the Quanty agent core invokes to act on
//   the user's mailbox. This replaces the stub tools in
//   `packages/ai/src/assistant/tools/quantmail-tools.ts` (which only
//   console.log and return fabricated data) with REAL implementations that
//   reuse the existing `EmailService` / `ThreadService` — no duplicated
//   business logic.
//
//   Twelve tools:
//     Read-only : search_emails, summarize_thread, list_unread
//     Reversible: archive_thread, unarchive_thread, star_thread, pin_thread,
//                 mark_read, snooze_thread, create_draft
//     Gated     : delete_thread (trash — reversible, needs confirm),
//                 send_email (needs confirm)
//
// SAFETY INVARIANTS
//   * USER SCOPING — userId comes ONLY from `AssistantContext.userId`
//     (never from tool args). Every Prisma query and every service call is
//     userId-scoped; services throw 403 on cross-user rows.
//   * AUDIT — every invocation is logged (tool, userId, sanitized args,
//     success/failure) through the injectable `audit` port.
//   * NO FABRICATION — on missing AI or missing rows the tools return honest
//     errors / extractive fallbacks, never invented content.

import type { PrismaClient } from '@prisma/client';
import type { AITool, AIToolResult, AssistantContext, AIEngine } from '@quant/ai';
import { EmailService } from '../../email.service';
import { ThreadService } from '../../thread.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An AITool plus the safety metadata the agent runtime needs. */
export interface QuantyMailTool extends AITool {
  /** True when the tool changes user-visible state. */
  destructive: boolean;
  /** True when the change can be undone (trash, archive, star...). */
  reversible: boolean;
  /** True when the runtime must ask the user before invoking. */
  requiresConfirmation: boolean;
}

/** One audit-trail entry per tool invocation. */
export interface MailAuditEntry {
  tool: string;
  userId: string;
  /** Args with body content truncated (never full bodies in logs). */
  args: Record<string, unknown>;
  success: boolean;
  at: string;
  error?: string;
}

/** Injectable summarization seam (production wires AISummarizeService). */
export interface SummarizePort {
  summarizeThread(
    messages: Array<{ from: string; subject: string; body: string }>,
    userId: string,
  ): Promise<{ summary: string; keyPoints: string[]; actionItems?: string[] }>;
}

/** Dependencies injected by the caller (backend app wiring). */
export interface QuantyMailToolsDeps {
  prisma: PrismaClient;
  emailService: EmailService;
  threadService: ThreadService;
  /** Optional — without it, summarize_thread returns an extractive fallback. */
  summarizeService?: SummarizePort | null;
  /** Optional — defaults to structured console logging. */
  audit?: (entry: MailAuditEntry) => void | Promise<void>;
  /**
   * Optional — when provided, the real Drive tools (drive.searchFiles,
   * drive.suggestDestination, drive.summarizeFile, drive.organizeFile) are
   * registered too. Without it they are skipped rather than stubbed.
   */
  aiEngine?: AIEngine | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const defaultAudit = (entry: MailAuditEntry): void => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ns: 'quanty-mail-tools', ...entry }));
};

/** Truncate long / sensitive arg values before they hit the audit log. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && (k === 'body' || k === 'query') && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…[truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function strArg(args: Record<string, unknown>, name: string, required = true): string {
  const v = args[name];
  if (typeof v !== 'string' || v.length === 0) {
    if (required) throw new Error(`Missing required parameter: ${name}`);
    return '';
  }
  return v;
}

function boolArg(args: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const v = args[name];
  return typeof v === 'boolean' ? v : fallback;
}

function numArg(args: Record<string, unknown>, name: string, fallback: number): number {
  const v = args[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

async function getOrCreateFolder(
  prisma: PrismaClient,
  userId: string,
  name: string,
  type: 'SENT' | 'ARCHIVE' | 'TRASH' | 'SPAM' | 'INBOX' | 'DRAFTS',
): Promise<{ id: string }> {
  const existing = await (prisma as any).emailFolder.findFirst({
    where: { userId, OR: [{ name }, { type }] },
    select: { id: true },
  });
  if (existing) return existing;
  return (prisma as any).emailFolder.create({
    data: { userId, name, type },
    select: { id: true },
  });
}

/** Resolve a thread to its email ids, userId-scoped (throws 404/403). */
async function threadEmailIds(
  threadService: ThreadService,
  threadId: string,
  userId: string,
): Promise<string[]> {
  const thread = await threadService.getThread(threadId, userId);
  return thread.emails.map((e) => e.id);
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AssistantContext,
) => Promise<AIToolResult>;

/**
 * Wrap a handler with audit logging + uniform error mapping.
 * userId is taken from context ONLY — never from args.
 */
function wrapTool(
  deps: QuantyMailToolsDeps,
  toolName: string,
  handler: (args: Record<string, unknown>, userId: string) => Promise<AIToolResult>,
): ToolHandler {
  const audit = deps.audit ?? defaultAudit;
  return async (args, context) => {
    const userId = context.userId;
    const at = new Date().toISOString();
    if (!userId) {
      const entry: MailAuditEntry = {
        tool: toolName,
        userId: '',
        args: sanitizeArgs(args),
        success: false,
        at,
        error: 'Missing userId in agent context',
      };
      await audit(entry);
      return { success: false, error: entry.error, displayMessage: 'Not authenticated.' };
    }
    try {
      const result = await handler(args, userId);
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: true, at });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: false, at, error: message });
      return { success: false, error: message, displayMessage: `Couldn't complete ${toolName}: ${message}` };
    }
  };
}

function snippetOf(body: string | null | undefined, max = 140): string {
  const plain = (body ?? '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function buildQuantyMailTools(deps: QuantyMailToolsDeps): QuantyMailTool[] {
  const { prisma, emailService, threadService, summarizeService } = deps;

  const searchEmails: QuantyMailTool = {
    name: 'search_emails',
    description: 'Search the user\'s mailbox by keyword, sender or subject. Returns matching threads.',
    parameters: {
      query: { type: 'string', description: 'Search query (keyword, sender, subject)', required: true },
      limit: { type: 'number', description: 'Max threads to return (default 10, max 50)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'search_emails', async (args, userId) => {
      const query = strArg(args, 'query');
      const limit = Math.min(Math.max(numArg(args, 'limit', 10), 1), 50);
      const page = await emailService.search(userId, query, { pageSize: limit });
      // Collapse to one row per thread (latest message wins).
      const byThread = new Map<string, { threadId: string; subject: string; from: string; snippet: string; messageCount: number; lastAt: string }>();
      for (const email of page.data as any[]) {
        const threadId = (email.threadId as string | null) ?? email.id;
        const existing = byThread.get(threadId);
        const row = {
          threadId,
          subject: email.subject ?? '(no subject)',
          from: email.fromName || email.fromAddress || 'unknown',
          snippet: snippetOf(email.bodyPlain ?? email.snippet),
          messageCount: (existing?.messageCount ?? 0) + 1,
          lastAt: email.receivedAt ? new Date(email.receivedAt).toISOString() : '',
        };
        if (!existing || (row.lastAt && row.lastAt > existing.lastAt)) {
          byThread.set(threadId, { ...row, messageCount: existing ? existing.messageCount + 1 : 1 });
        } else {
          existing.messageCount += 1;
        }
      }
      const threads = [...byThread.values()].slice(0, limit);
      return {
        success: true,
        data: { threads, totalEmails: page.total },
        displayMessage: `Found ${threads.length} thread${threads.length === 1 ? '' : 's'} matching "${query}".`,
      };
    }),
  };

  const archiveThread: QuantyMailTool = {
    name: 'archive_thread',
    description: 'Archive a conversation thread (moves all its messages out of the inbox). Reversible via unarchive_thread.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to archive', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'archive_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const ids = await threadEmailIds(threadService, threadId, userId);
      const folder = await getOrCreateFolder(prisma, userId, 'Archive', 'ARCHIVE');
      const { count } = await emailService.batchArchive(ids, folder.id, userId);
      return {
        success: true,
        data: { threadId, archivedMessages: count },
        displayMessage: `Archived thread (${count} message${count === 1 ? '' : 's'}).`,
      };
    }),
  };

  const unarchiveThread: QuantyMailTool = {
    name: 'unarchive_thread',
    description: 'Move an archived thread back to the inbox.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to move back to inbox', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'unarchive_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const ids = await threadEmailIds(threadService, threadId, userId);
      const folder = await getOrCreateFolder(prisma, userId, 'Inbox', 'INBOX');
      const result = await (prisma as any).email.updateMany({
        where: { id: { in: ids }, userId, deletedAt: null },
        // QM-BACK-002: keep the version column truthful on system/agent writes.
        data: { folderId: folder.id, isTrash: false, updatedAt: new Date(), version: { increment: 1 } },
      });
      return {
        success: true,
        data: { threadId, restoredMessages: result.count as number },
        displayMessage: `Moved thread back to inbox (${result.count} message${result.count === 1 ? '' : 's'}).`,
      };
    }),
  };

  const starThread: QuantyMailTool = {
    name: 'star_thread',
    description: 'Star or unstar a conversation thread.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to star/unstar', required: true },
      starred: { type: 'boolean', description: 'true to star, false to unstar (default true)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'star_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const starred = boolArg(args, 'starred', true);
      const ids = await threadEmailIds(threadService, threadId, userId);
      const { count } = await emailService.batchStar(ids, userId, starred);
      return {
        success: true,
        data: { threadId, starred, updatedMessages: count },
        displayMessage: starred ? `Starred thread (${count} message${count === 1 ? '' : 's'}).` : `Unstarred thread (${count} message${count === 1 ? '' : 's'}).`,
      };
    }),
  };

  const pinThread: QuantyMailTool = {
    name: 'pin_thread',
    description: 'Pin or unpin a conversation thread to the top of the inbox.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to pin/unpin', required: true },
      pinned: { type: 'boolean', description: 'true to pin, false to unpin (default true)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'pin_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const pinned = boolArg(args, 'pinned', true);
      // Verify ownership first (throws 404/403) — then userId-scoped update.
      await threadService.getThread(threadId, userId);
      const result = await (prisma as any).email.updateMany({
        where: { threadId, userId, deletedAt: null },
        // QM-BACK-002: keep the version column truthful on system/agent writes.
        data: { isPinned: pinned, updatedAt: new Date(), version: { increment: 1 } },
      });
      return {
        success: true,
        data: { threadId, pinned, updatedMessages: result.count as number },
        displayMessage: pinned ? `Pinned thread to top (${result.count} message${result.count === 1 ? '' : 's'}).` : `Unpinned thread (${result.count} message${result.count === 1 ? '' : 's'}).`,
      };
    }),
  };

  const markRead: QuantyMailTool = {
    name: 'mark_read',
    description: 'Mark a conversation thread as read.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to mark as read', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'mark_read', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const ids = await threadEmailIds(threadService, threadId, userId);
      const { count } = await emailService.batchMarkRead(ids, userId, true);
      return {
        success: true,
        data: { threadId, markedMessages: count },
        displayMessage: `Marked thread as read (${count} message${count === 1 ? '' : 's'}).`,
      };
    }),
  };

  const deleteThread: QuantyMailTool = {
    name: 'delete_thread',
    description: 'Move a conversation thread to trash. Reversible (restore from trash). Requires user confirmation.',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to move to trash', required: true },
    },
    destructive: true,
    reversible: true,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'delete_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const ids = await threadEmailIds(threadService, threadId, userId);
      const { count } = await emailService.batchDelete(ids, userId, false);
      return {
        success: true,
        data: { threadId, trashedMessages: count },
        displayMessage: `Moved thread to trash (${count} message${count === 1 ? '' : 's'}). You can restore it from trash.`,
      };
    }),
  };

  const snoozeThread: QuantyMailTool = {
    name: 'snooze_thread',
    description: 'Snooze a conversation thread until a given time (ISO 8601 timestamp).',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to snooze', required: true },
      until: { type: 'string', description: 'ISO 8601 timestamp to snooze until', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'snooze_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const untilRaw = strArg(args, 'until');
      const until = new Date(untilRaw);
      if (Number.isNaN(until.getTime())) throw new Error('Invalid "until" timestamp — use ISO 8601.');
      const updated = await threadService.snoozeThread(threadId, userId, until);
      return {
        success: true,
        data: { threadId, snoozedUntil: updated.snoozedUntil },
        displayMessage: `Snoozed thread until ${until.toLocaleString()}.`,
      };
    }),
  };

  const sendEmail: QuantyMailTool = {
    name: 'send_email',
    description: 'Send an email. Requires user confirmation before invoking.',
    parameters: {
      to: { type: 'string', description: 'Recipient email address', required: true },
      subject: { type: 'string', description: 'Email subject', required: true },
      body: { type: 'string', description: 'Email body (plain text)', required: true },
    },
    destructive: true,
    reversible: false,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'send_email', async (args, userId) => {
      const to = strArg(args, 'to');
      const subject = strArg(args, 'subject');
      const body = strArg(args, 'body');
      const sentFolder = await getOrCreateFolder(prisma, userId, 'Sent', 'SENT');
      const sent = await emailService.sendEmail(
        userId,
        { toAddresses: [to], subject, bodyPlain: body, bodyHtml: body },
        sentFolder.id,
      );
      return {
        success: true,
        data: { emailId: (sent as any).id, to, subject },
        displayMessage: `Email sent to ${to}.`,
      };
    }),
  };

  const createDraft: QuantyMailTool = {
    name: 'create_draft',
    description: 'Create (but do not send) an email draft the user can review and send later.',
    parameters: {
      to: { type: 'string', description: 'Recipient email address', required: true },
      subject: { type: 'string', description: 'Email subject', required: true },
      body: { type: 'string', description: 'Email body (plain text)', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'create_draft', async (args, userId) => {
      const to = strArg(args, 'to');
      const subject = strArg(args, 'subject');
      const body = strArg(args, 'body');
      const draft = await emailService.compose({
        userId,
        toAddresses: [to],
        subject,
        bodyPlain: body,
        bodyHtml: body,
      });
      return {
        success: true,
        data: { draftId: (draft as any).id, to, subject },
        displayMessage: `Draft created for ${to} — ready for your review.`,
      };
    }),
  };

  const summarizeThread: QuantyMailTool = {
    name: 'summarize_thread',
    description: 'Get a concise summary of a conversation thread (AI summary when available, extractive fallback otherwise).',
    parameters: {
      threadId: { type: 'string', description: 'Thread ID to summarize', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'summarize_thread', async (args, userId) => {
      const threadId = strArg(args, 'threadId');
      const thread = await threadService.getThread(threadId, userId);
      const messages = thread.emails.map((e: any) => ({
        from: e.fromName || e.fromAddress || 'unknown',
        subject: e.subject ?? '(no subject)',
        body: e.bodyPlain || snippetOf(e.bodyHtml, 2000),
      }));
      if (summarizeService) {
        const result = await summarizeService.summarizeThread(messages, userId);
        return {
          success: true,
          data: { threadId, messageCount: messages.length, ...result },
          displayMessage: `Thread summary: ${result.summary}`,
        };
      }
      // Honest extractive fallback — never invent content.
      const keyPoints = messages.slice(0, 5).map(
        (m, i) => `#${i + 1} ${m.from}: ${snippetOf(m.body, 120)}`,
      );
      const summary = `Thread with ${messages.length} message${messages.length === 1 ? '' : 's'} (AI summarizer unavailable — extractive preview).`;
      return {
        success: true,
        data: { threadId, messageCount: messages.length, summary, keyPoints, extractive: true },
        displayMessage: summary,
      };
    }),
  };

  const listUnread: QuantyMailTool = {
    name: 'list_unread',
    description: 'List unread conversation threads with the total unread count.',
    parameters: {
      limit: { type: 'number', description: 'Max threads to return (default 20, max 50)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'list_unread', async (args, userId) => {
      const limit = Math.min(Math.max(numArg(args, 'limit', 20), 1), 50);
      const unread = await (prisma as any).email.findMany({
        where: { userId, isRead: false, deletedAt: null, isTrash: false, isSpam: false },
        orderBy: { receivedAt: 'desc' },
        take: limit * 3,
        select: { id: true, threadId: true, subject: true, fromName: true, fromAddress: true, bodyPlain: true, receivedAt: true },
      });
      const totalUnread = await (prisma as any).email.count({
        where: { userId, isRead: false, deletedAt: null, isTrash: false, isSpam: false },
      });
      const byThread = new Map<string, { threadId: string; subject: string; from: string; snippet: string; unreadCount: number; lastAt: string }>();
      for (const email of unread as any[]) {
        const threadId = (email.threadId as string | null) ?? email.id;
        const lastAt = email.receivedAt ? new Date(email.receivedAt).toISOString() : '';
        const existing = byThread.get(threadId);
        if (!existing) {
          byThread.set(threadId, {
            threadId,
            subject: email.subject ?? '(no subject)',
            from: email.fromName || email.fromAddress || 'unknown',
            snippet: snippetOf(email.bodyPlain),
            unreadCount: 1,
            lastAt,
          });
        } else {
          existing.unreadCount += 1;
        }
      }
      const threads = [...byThread.values()].slice(0, limit);
      return {
        success: true,
        data: { threads, totalUnread },
        displayMessage:
          totalUnread === 0
            ? 'Inbox zero — no unread messages.'
            : `${totalUnread} unread message${totalUnread === 1 ? '' : 's'} across ${threads.length} thread${threads.length === 1 ? '' : 's'}.`,
      };
    }),
  };

  return [
    searchEmails,
    archiveThread,
    unarchiveThread,
    starThread,
    pinThread,
    markRead,
    deleteThread,
    snoozeThread,
    sendEmail,
    createDraft,
    summarizeThread,
    listUnread,
  ];
}
