// ============================================================================
// Quanty agent — Gmail MCP tools ("hands" for the user's REAL Gmail)
// ============================================================================
//
// PURPOSE
//   Four tools that let Quanty act on the user's connected Gmail account
//   through the Gmail MCP client (./gmail-mcp-client.ts):
//
//     Read-only : gmail_search, gmail_read
//     Reversible: gmail_archive
//     Gated     : gmail_send (destructive — requiresConfirmation: true)
//
//   This mirrors the internal mail-tools.ts pattern (QuantyMailTool shape,
//   wrapTool audit wrapper, userId-from-context-only) but the handlers call
//   the Gmail MCP client instead of the QuantMail EmailService.
//
// SAFETY INVARIANTS
//   * USER SCOPING — userId comes ONLY from `AssistantContext.userId`.
//     The GmailOAuth layer resolves that user's stored Gmail grant; there is
//     no cross-user access by construction (no userId in tool args).
//   * NOT CONNECTED is a first-class result — tools return a helpful
//     "connect Gmail" message instead of failing cryptically.
//   * AUDIT — every invocation logged (tool, userId, sanitized args,
//     success/failure). Bodies/subjects truncated; tokens never logged.
//   * SEND CONFIRMATION — gmail_send requiresConfirmation: true; the agent
//     runtime must show the exact recipient/subject/body and get explicit
//     approval before invoking (same rule as the Gmail skill).

import type { AITool, AIToolResult, AssistantContext } from '@quant/ai';
import {
  GmailMcpClient,
  GmailRestTransport,
  type GmailMessage,
} from './gmail-mcp-client';
import { GmailOAuth } from './gmail-oauth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Gmail MCP tool plus the safety metadata the agent runtime needs. */
export interface QuantyGmailTool extends AITool {
  /** True when the tool changes user-visible state. */
  destructive: boolean;
  /** True when the change can be undone. */
  reversible: boolean;
  /** True when the runtime must ask the user before invoking. */
  requiresConfirmation: boolean;
}

/** One audit-trail entry per Gmail tool invocation. */
export interface GmailToolAuditEntry {
  tool: string;
  userId: string;
  /** Args with bodies truncated (never full content in logs). */
  args: Record<string, unknown>;
  success: boolean;
  at: string;
  error?: string;
}

/** Dependencies injected by the caller (backend app wiring). */
export interface QuantyGmailToolsDeps {
  /** Resolves a connected GmailMcpClient for a user (null when not connected). */
  getClient: (userId: string) => Promise<GmailMcpClient | null>;
  /** Optional — defaults to structured console logging. */
  audit?: (entry: GmailToolAuditEntry) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const defaultAudit = (entry: GmailToolAuditEntry): void => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ns: 'quanty-gmail-tools', ...entry }));
};

/** Truncate long/sensitive arg values before they hit the audit log. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && (k === 'body' || k === 'query' || k === 'raw') && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…[truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function strArg(args: Record<string, unknown>, name: string, required = true): string {
  const v = args[name];
  if (typeof v === 'string' && v.length > 0) return v;
  if (required) throw new Error(`Missing required parameter: ${name}`);
  return '';
}

function numArg(args: Record<string, unknown>, name: string, fallback: number): number {
  const v = args[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AssistantContext,
) => Promise<AIToolResult>;

/** Result returned when Gmail is not connected for this user. */
function notConnectedResult(): AIToolResult {
  return {
    success: false,
    error: 'GMAIL_NOT_CONNECTED',
    displayMessage:
      'Gmail is not connected yet. Tap "Connect Gmail" in the Quanty panel to link your Gmail account.',
  };
}

/**
 * Wrap a handler with: userId-from-context, connected-client resolution,
 * audit logging, and uniform error mapping.
 */
function wrapTool(
  deps: QuantyGmailToolsDeps,
  toolName: string,
  handler: (args: Record<string, unknown>, client: GmailMcpClient) => Promise<AIToolResult>,
): ToolHandler {
  const audit = deps.audit ?? defaultAudit;
  return async (args, context) => {
    const userId = context.userId;
    const at = new Date().toISOString();
    const log = (success: boolean, error?: string) =>
      audit({ tool: toolName, userId: userId ?? '', args: sanitizeArgs(args), success, at, error });

    if (!userId) {
      const error = 'Missing userId in agent context';
      await log(false, error);
      return { success: false, error, displayMessage: 'Not authenticated.' };
    }
    let client: GmailMcpClient | null;
    try {
      client = await deps.getClient(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await log(false, message);
      return { success: false, error: message, displayMessage: `Couldn't reach Gmail: ${message}` };
    }
    if (!client) {
      await log(false, 'GMAIL_NOT_CONNECTED');
      return notConnectedResult();
    }
    try {
      const result = await handler(args, client);
      await log(result.success, result.success ? undefined : (result.error ?? 'tool failed'));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await log(false, message);
      return { success: false, error: message, displayMessage: `Couldn't complete ${toolName}: ${message}` };
    }
  };
}

// ---------------------------------------------------------------------------
// Gmail message parsing helpers
// ---------------------------------------------------------------------------

function headerOf(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers ?? [];
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

/** Extract a plain-text snippet from a Gmail message payload. */
function bodyTextOf(msg: GmailMessage, max = 500): string {
  const findText = (part: NonNullable<GmailMessage['payload']>): string | null => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      try {
        return Buffer.from(part.body.data, 'base64url').toString('utf8');
      } catch {
        return null;
      }
    }
    for (const sub of part.parts ?? []) {
      const found = findText(sub);
      if (found) return found;
    }
    return null;
  };
  const text = (msg.payload ? findText(msg.payload) : null) ?? msg.snippet ?? '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function messageRow(msg: GmailMessage): Record<string, unknown> {
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headerOf(msg, 'From'),
    to: headerOf(msg, 'To'),
    subject: headerOf(msg, 'Subject') || '(no subject)',
    date: headerOf(msg, 'Date'),
    snippet: (msg.snippet ?? '').slice(0, 160),
    labelIds: msg.labelIds ?? [],
    unread: (msg.labelIds ?? []).includes('UNREAD'),
  };
}

/** Build a base64url RFC822 message (what gmail_send_message expects). */
export function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  from?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    ...(opts.bcc ? [`Bcc: ${opts.bcc}`] : []),
    ...(opts.from ? [`From: ${opts.from}`] : []),
    `Subject: ${opts.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function buildQuantyGmailTools(deps: QuantyGmailToolsDeps): QuantyGmailTool[] {
  const gmailSearch: QuantyGmailTool = {
    name: 'gmail_search',
    description:
      "Search the user's REAL Gmail account. Use Gmail search syntax (from:, subject:, is:unread, has:attachment, after:, before:). Returns matching messages.",
    parameters: {
      query: { type: 'string', description: 'Gmail search query, e.g. "is:unread in:inbox"', required: true },
      maxResults: { type: 'number', description: 'Max messages (default 10, max 50)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'gmail_search', async (args, client) => {
      const query = strArg(args, 'query');
      const maxResults = Math.min(Math.max(numArg(args, 'maxResults', 10), 1), 50);
      const list = await client.listMessages(query, maxResults);
      const messages = list.messages ?? [];
      // Fetch metadata for each hit (1 unit each — bounded by maxResults).
      const rows: Record<string, unknown>[] = [];
      for (const m of messages) {
        const full = await client.getMessage(m.id, 'metadata');
        rows.push(messageRow(full));
      }
      return {
        success: true,
        data: { messages: rows, resultSizeEstimate: list.resultSizeEstimate ?? rows.length },
        displayMessage: `Found ${rows.length} Gmail message${rows.length === 1 ? '' : 's'} matching "${query}".`,
      };
    }),
  };

  const gmailRead: QuantyGmailTool = {
    name: 'gmail_read',
    description: "Read one Gmail message in full (headers + plain-text body). Prefer gmail_search first to find the message ID.",
    parameters: {
      messageId: { type: 'string', description: 'Gmail message ID', required: true },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'gmail_read', async (args, client) => {
      const messageId = strArg(args, 'messageId');
      const msg = await client.getMessage(messageId, 'full');
      const attachments: Array<{ filename: string; mimeType: string; size: number }> = [];
      const collect = (part: NonNullable<GmailMessage['payload']>): void => {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType ?? 'application/octet-stream',
            size: part.body.size ?? 0,
          });
        }
        for (const sub of part.parts ?? []) collect(sub);
      };
      if (msg.payload) collect(msg.payload);
      return {
        success: true,
        data: {
          ...messageRow(msg),
          body: bodyTextOf(msg, 4000),
          attachments,
        },
        displayMessage: `Read Gmail message "${headerOf(msg, 'Subject') || '(no subject)'}".`,
      };
    }),
  };

  const gmailSend: QuantyGmailTool = {
    name: 'gmail_send',
    description:
      'Send an email from the user\'s REAL Gmail account. DESTRUCTIVE — the runtime must show the exact recipient, subject and body and get explicit user approval before invoking.',
    parameters: {
      to: { type: 'string', description: 'Recipient email address(es), comma-separated', required: true },
      subject: { type: 'string', description: 'Email subject', required: true },
      body: { type: 'string', description: 'Plain-text email body', required: true },
      cc: { type: 'string', description: 'CC addresses, comma-separated', required: false },
      bcc: { type: 'string', description: 'BCC addresses, comma-separated', required: false },
    },
    destructive: true,
    reversible: false,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'gmail_send', async (args, client) => {
      const to = strArg(args, 'to');
      const subject = strArg(args, 'subject');
      const body = strArg(args, 'body');
      const cc = strArg(args, 'cc', false) || undefined;
      const bcc = strArg(args, 'bcc', false) || undefined;
      // Basic recipient sanity — never send to an empty/garbage address.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.split(',')[0].trim())) {
        throw new Error(`Invalid recipient address: "${to}"`);
      }
      const raw = buildRawEmail({ to, subject, body, cc, bcc });
      const sent = await client.sendMessage(raw);
      return {
        success: true,
        data: { gmailId: sent.id, threadId: sent.threadId, to, subject },
        displayMessage: `Sent Gmail to ${to} — "${subject}".`,
      };
    }),
  };

  const gmailArchive: QuantyGmailTool = {
    name: 'gmail_archive',
    description:
      'Archive Gmail messages (removes them from the inbox; they stay in All Mail and keep read/unread state). Reversible — tell the user they can find it in All Mail.',
    parameters: {
      messageIds: {
        type: 'string',
        description: 'Comma-separated Gmail message IDs to archive (max 20 per call)',
        required: true,
      },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'gmail_archive', async (args, client) => {
      const ids = strArg(args, 'messageIds')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (ids.length === 0) throw new Error('No message IDs provided');
      let archived = 0;
      for (const id of ids) {
        await client.modifyMessage(id, [], ['INBOX']);
        archived += 1;
      }
      return {
        success: true,
        data: { archived, messageIds: ids },
        displayMessage: `Archived ${archived} Gmail message${archived === 1 ? '' : 's'} (still in All Mail).`,
      };
    }),
  };

  return [gmailSearch, gmailRead, gmailSend, gmailArchive];
}
