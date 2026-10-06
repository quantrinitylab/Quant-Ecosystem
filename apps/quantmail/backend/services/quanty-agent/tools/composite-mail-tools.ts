// ============================================================================
// Quanty agent — composite mail tools ("command-level" tools)
// ============================================================================
//
// PURPOSE
//   The rule-based planner matches natural-language commands like "archive
//   unread" or "clean inbox". Those commands need MULTI-primitive operations
//   (list unread threads, then archive each one) but a plan step carries only
//   static args — it cannot chain "use the output of step 1 as the input of
//   step 2". These composite tools close that gap: each one is a REAL
//   implementation built by composing the real primitives from
//   `./mail-tools.ts` (list_unread, archive_thread, mark_read, star_thread,
//   delete_thread, summarize_thread, search_emails). No stubs, no fabricated
//   results — every mutation goes through the same userId-scoped services.
//
//   Registered under `mail.*` names alongside the adapted primitives.

import type { AIToolResult, AssistantContext } from '@quant/ai';
import { buildQuantyMailTools } from './mail-tools';
import type { QuantyMailTool, QuantyMailToolsDeps } from './mail-tools';
import type { QuantyTool, QuantyToolContext, QuantyToolResult } from '../types';

/** Keywords that make an unread thread "look important". */
const IMPORTANT_RE = /\b(urgent|important|asap|action required|deadline|invoice|payment|contract|offer|interview)\b/i;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(v: unknown, fallback = DEFAULT_LIMIT): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(Math.floor(n), 1), MAX_LIMIT);
}

function assistantContextFor(ctx: QuantyToolContext): AssistantContext {
  return {
    userId: ctx.userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: { taskId: ctx.taskId },
  };
}

interface ThreadRow {
  threadId: string;
  subject?: string;
  from?: string;
  snippet?: string;
}

/** Invoke one real mail primitive by its snake_case name; throws on failure. */
function makePrimitiveCaller(tools: QuantyMailTool[]) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return async function call(
    name: string,
    args: Record<string, unknown>,
    ctx: QuantyToolContext,
  ): Promise<AIToolResult> {
    const tool = byName.get(name);
    if (!tool) throw new Error(`mail primitive "${name}" is not registered`);
    const res = await tool.handler(args, assistantContextFor(ctx));
    if (!res.success) {
      throw new Error(res.error || res.displayMessage || `${name} failed`);
    }
    return res;
  };
}

function threadRows(data: unknown): ThreadRow[] {
  const threads = (data as { threads?: ThreadRow[] } | undefined)?.threads;
  return Array.isArray(threads) ? threads.filter((t) => t && typeof t.threadId === 'string') : [];
}

/** Build the five composite tools. Pure factory — no global state. */
export function buildCompositeMailTools(deps: QuantyMailToolsDeps): QuantyTool[] {
  const primitives = buildQuantyMailTools(deps);
  const call = makePrimitiveCaller(primitives);

  const archiveUnread: QuantyTool = {
    name: 'mail.archiveUnread',
    app: 'mail',
    description: 'Archive all unread threads in the inbox (reversible — can be undone).',
    parameters: {
      limit: { type: 'number', description: 'Max unread threads to archive', default: DEFAULT_LIMIT },
    },
    destructive: false,
    reversible: true,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      const limit = clampLimit(args.limit);
      const list = await call('list_unread', { limit }, ctx);
      const threads = threadRows(list.data);
      const threadIds: string[] = [];
      for (const t of threads) {
        await call('archive_thread', { threadId: t.threadId }, ctx);
        threadIds.push(t.threadId);
      }
      return {
        ok: true,
        data: { archived: threadIds.length, threadIds },
        summary:
          threadIds.length === 0
            ? 'No unread threads to archive.'
            : `Archived ${threadIds.length} unread thread${threadIds.length === 1 ? '' : 's'}.`,
        reversible: threadIds.length > 0,
        undoToken: { threadIds },
      };
    },
  };

  const markAllRead: QuantyTool = {
    name: 'mail.markAllRead',
    app: 'mail',
    description: 'Mark all unread threads as read.',
    parameters: {
      limit: { type: 'number', description: 'Max unread threads to mark read', default: DEFAULT_LIMIT },
    },
    destructive: false,
    // No "mark unread" primitive exists, so this cannot be reversed by the agent.
    reversible: false,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      const limit = clampLimit(args.limit);
      const list = await call('list_unread', { limit }, ctx);
      const threads = threadRows(list.data);
      let marked = 0;
      for (const t of threads) {
        await call('mark_read', { threadId: t.threadId }, ctx);
        marked += 1;
      }
      return {
        ok: true,
        data: { marked },
        summary:
          marked === 0 ? 'Nothing unread — already all caught up.' : `Marked ${marked} thread${marked === 1 ? '' : 's'} as read.`,
        reversible: false,
      };
    },
  };

  const starImportant: QuantyTool = {
    name: 'mail.starImportant',
    app: 'mail',
    description:
      'Star unread threads that look important (subject/sender/snippet match importance keywords). Reversible.',
    parameters: {
      limit: { type: 'number', description: 'Max threads to star', default: 10 },
    },
    destructive: false,
    reversible: true,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      const limit = clampLimit(args.limit, 10);
      const list = await call('list_unread', { limit: MAX_LIMIT }, ctx);
      const candidates = threadRows(list.data)
        .filter((t) => IMPORTANT_RE.test(`${t.subject ?? ''} ${t.from ?? ''} ${t.snippet ?? ''}`))
        .slice(0, limit);
      const threadIds: string[] = [];
      for (const t of candidates) {
        await call('star_thread', { threadId: t.threadId, starred: true }, ctx);
        threadIds.push(t.threadId);
      }
      return {
        ok: true,
        data: { starred: threadIds.length, threadIds },
        summary:
          threadIds.length === 0
            ? 'No unread threads looked important.'
            : `Starred ${threadIds.length} important thread${threadIds.length === 1 ? '' : 's'}.`,
        reversible: threadIds.length > 0,
        undoToken: { threadIds },
      };
    },
  };

  const deleteSpam: QuantyTool = {
    name: 'mail.deleteSpam',
    app: 'mail',
    description: 'Move spam threads to trash. Asks for confirmation first.',
    parameters: {},
    // destructive: true -> the executor pauses in waiting-confirm until the
    // user taps "Haan, karo". There is no auto-resolve.
    destructive: true,
    // Trash has no agent-side restore primitive; the user can restore from the
    // Trash folder UI themselves, but the agent cannot reverse this.
    reversible: false,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      void args;
      const prisma = (deps.prisma as {
        email: { findMany: (a: unknown) => Promise<Array<{ threadId: string | null; id: string }>> };
      }).email;
      const rows = await prisma.findMany({
        where: { userId: ctx.userId, isSpam: true, isTrash: false, deletedAt: null },
        select: { id: true, threadId: true },
        take: MAX_LIMIT,
      });
      const seen = new Set<string>();
      const threadIds: string[] = [];
      for (const r of rows) {
        const tid = r.threadId ?? r.id;
        if (!seen.has(tid)) {
          seen.add(tid);
          threadIds.push(tid);
        }
      }
      for (const threadId of threadIds) {
        await call('delete_thread', { threadId }, ctx);
      }
      return {
        ok: true,
        data: { trashed: threadIds.length, threadIds },
        summary:
          threadIds.length === 0
            ? 'No spam threads to delete.'
            : `Moved ${threadIds.length} spam thread${threadIds.length === 1 ? '' : 's'} to trash.`,
        reversible: false,
      };
    },
  };

  const summarizeLatest: QuantyTool = {
    name: 'mail.summarizeLatest',
    app: 'mail',
    description: 'Summarize the latest unread thread (extractive fallback when AI is unavailable).',
    parameters: {},
    destructive: false,
    reversible: false,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      void args;
      const list = await call('list_unread', { limit: 1 }, ctx);
      const threads = threadRows(list.data);
      if (threads.length === 0) {
        return {
          ok: true,
          data: { threads: 0 },
          summary: 'No unread threads — nothing to summarize.',
          reversible: false,
        };
      }
      const res = await call('summarize_thread', { threadId: threads[0].threadId }, ctx);
      return {
        ok: true,
        data: res.data,
        summary: res.displayMessage,
        reversible: false,
      };
    },
  };

  return [archiveUnread, markAllRead, starImportant, deleteSpam, summarizeLatest];
}
