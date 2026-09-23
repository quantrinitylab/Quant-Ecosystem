// ============================================================================
// SMTP Submission Daemon - Anti-Spoofing & MIME Envelope Sanitizer (RFC 6409)
// ============================================================================

import type { SMTPServerSession } from 'smtp-server';
import type { AuthenticatedUser } from './auth';

export interface TraceHeaderOptions {
  clientAddress: string;
  clientHostname?: string;
  messageId: string;
  envelopeTo?: string[];
  submissionHost?: string;
  date?: Date;
}

export interface SenderVerificationResult {
  valid: boolean;
  normalizedAddress: string;
  error?: string;
}

/**
 * Extract clean email address from string which might be formatted as:
 * - `<user@domain.com>`
 * - `Name <user@domain.com>`
 * - `user@domain.com`
 */
export function extractEmailAddress(raw: string): string {
  const match = /<([^>]+)>/.exec(raw);
  if (match && match[1]) {
    return match[1].trim().toLowerCase();
  }
  return raw.trim().toLowerCase();
}

/**
 * Resolves whether a given sender address is authorized for the authenticated user.
 * Supports primary address matching, standard plus-addressing subaddressing,
 * and verified user aliases.
 */
export function isAuthorizedSender(
  user: AuthenticatedUser,
  mailFromAddress: string,
  extraAliases: string[] = [],
): boolean {
  const cleanMailFrom = extractEmailAddress(mailFromAddress);
  const userPrimary = extractEmailAddress(user.email);

  // 1. Direct match with primary email
  if (cleanMailFrom === userPrimary) {
    return true;
  }

  // 2. Direct match with username if username contains @domain
  if (user.username && user.username.includes('@')) {
    if (cleanMailFrom === extractEmailAddress(user.username)) {
      return true;
    }
  }

  // 3. RFC 5233 subaddressing / plus-addressing (e.g., user+alias@domain.com -> user@domain.com)
  const plusIndex = cleanMailFrom.indexOf('+');
  const atIndex = cleanMailFrom.indexOf('@');
  if (plusIndex !== -1 && atIndex !== -1 && plusIndex < atIndex) {
    const baseAddress = `${cleanMailFrom.slice(0, plusIndex)}${cleanMailFrom.slice(atIndex)}`;
    if (baseAddress === userPrimary) {
      return true;
    }
  }

  // 4. Verified user aliases
  const allowedAliases = [
    ...(user.activeAliases || []).map((a) => extractEmailAddress(a)),
    ...extraAliases.map((a) => extractEmailAddress(a)),
  ];

  for (const alias of allowedAliases) {
    if (cleanMailFrom === alias) {
      return true;
    }
    // Also support plus-addressing on verified aliases
    if (plusIndex !== -1 && atIndex !== -1 && plusIndex < atIndex) {
      const baseAddress = `${cleanMailFrom.slice(0, plusIndex)}${cleanMailFrom.slice(atIndex)}`;
      if (baseAddress === alias) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Strict anti-spoofing verification for SMTP MAIL FROM envelope command.
 * Rejects any sender that does not match the authenticated account with
 * RFC-compliant error `550 5.7.1 Sender identity mismatch`.
 */
export function verifySenderIdentity(
  user: AuthenticatedUser | undefined | null,
  mailFromAddress: string,
  extraAliases: string[] = [],
): SenderVerificationResult {
  const cleanAddress = extractEmailAddress(mailFromAddress);

  if (!user) {
    return {
      valid: false,
      normalizedAddress: cleanAddress,
      error: '530 5.7.0 Authentication required',
    };
  }

  const authorized = isAuthorizedSender(user, cleanAddress, extraAliases);
  if (!authorized) {
    return {
      valid: false,
      normalizedAddress: cleanAddress,
      error: '550 5.7.1 Sender identity mismatch',
    };
  }

  return {
    valid: true,
    normalizedAddress: cleanAddress,
  };
}

/**
 * Strips all `Bcc:` headers (including folded continuation lines) from an outgoing MIME stream
 * to permanently eliminate the P1-03 privacy leak.
 */
export function stripBccHeaders(mimeContent: string): string {
  // Find boundary between headers and body (CRLF CRLF or LF LF)
  let headerEndIndex = mimeContent.indexOf('\r\n\r\n');
  let lineEnding = '\r\n';

  if (headerEndIndex === -1) {
    headerEndIndex = mimeContent.indexOf('\n\n');
    lineEnding = '\n';
  }

  // If no body separator found, treat entire content as headers
  const headerBlock = headerEndIndex !== -1 ? mimeContent.slice(0, headerEndIndex) : mimeContent;
  const bodyBlock =
    headerEndIndex !== -1 ? mimeContent.slice(headerEndIndex + lineEnding.length * 2) : '';

  const headerLines = headerBlock.split(/\r?\n/);
  const cleanHeaderLines: string[] = [];
  let isDiscardingBcc = false;

  for (const line of headerLines) {
    // Check if line is folded continuation (starts with space or tab)
    if (/^[ \t]/.test(line)) {
      if (!isDiscardingBcc) {
        cleanHeaderLines.push(line);
      }
      continue;
    }

    // New header field
    if (/^bcc\s*:/i.test(line)) {
      isDiscardingBcc = true;
    } else {
      isDiscardingBcc = false;
      cleanHeaderLines.push(line);
    }
  }

  const sanitizedHeaders = cleanHeaderLines.join(lineEnding);
  if (!bodyBlock) {
    return sanitizedHeaders;
  }

  return `${sanitizedHeaders}${lineEnding}${lineEnding}${bodyBlock}`;
}

/**
 * Generates an RFC 6409 compliant trace header and prepends it to the MIME headers.
 */
export function injectTraceHeader(mimeContent: string, options: TraceHeaderOptions): string {
  const host = options.submissionHost || 'submission.quantmail.in';
  const clientName = options.clientHostname || options.clientAddress;
  const dateStr = (options.date || new Date()).toUTCString();
  const rcptFor =
    options.envelopeTo && options.envelopeTo.length > 0 ? ` for <${options.envelopeTo[0]}>` : '';

  const traceHeader =
    `Received: from ${clientName} (${options.clientAddress})\r\n` +
    `    by ${host} with ESMTPSA (QuantMail Submission)\r\n` +
    `    id <${options.messageId}>${rcptFor};\r\n` +
    `    ${dateStr}\r\n`;

  return `${traceHeader}${mimeContent}`;
}

/**
 * Process and sanitize an incoming submission message:
 * 1. Strips Bcc headers
 * 2. Injects authenticated trace headers
 *
 * @returns Cleaned MIME string ready for queueing and MTA delivery
 */
export function sanitizeAndTraceMime(
  rawMime: string,
  session: SMTPServerSession,
  messageId: string,
  submissionHost: string = 'submission.quantmail.in',
): string {
  const stripped = stripBccHeaders(rawMime);
  const envelopeTo = session.envelope.rcptTo.map((r) => r.address);

  return injectTraceHeader(stripped, {
    clientAddress: session.remoteAddress,
    clientHostname: session.clientHostname || session.hostNameAppearsAs,
    messageId,
    envelopeTo,
    submissionHost,
  });
}
