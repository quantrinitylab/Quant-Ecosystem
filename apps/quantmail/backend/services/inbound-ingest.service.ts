import type { PrismaClient, Email } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import {
  DeliverabilityAuthService,
  extractAddress,
  type AuthVerdict,
  type InboundAuthMessage,
} from './deliverability-auth.service';
import { EmailService } from './email.service';
import { ThreadService } from './thread.service';
import { MailFilterService, type ResolvedActions } from './mail-filter.service';
import { VacationResponderService } from './vacation-responder.service';
// Observability (Task 23.1, Req 23.2): every inbound delivery operation emits a span.
import { noopSpanPort, withSpan, type SpanPort } from '../shared/observability';

/**
 * InboundIngestAdapter (QuantMail SuperHub — Pillar 1, Phase 2, task 7.1).
 *
 * Bridges the `smtp-inbound` infra service into the mail domain. For each raw
 * inbound message it:
 *   1. evaluates SPF/DKIM/DMARC via `DeliverabilityAuthService.verifyInbound` and
 *      records the combined `AuthVerdict` on the resulting email (Requirement 5.1);
 *   2. when authentication passes, persists the email, stitches it into the
 *      correct thread, routes it to the recipient's inbox folder, and indexes it
 *      (Requirement 5.2);
 *   3. when the message fails DMARC alignment, quarantines it to the spam folder
 *      (flagged `isSpam`) instead of routing it to the inbox, and does NOT index
 *      it (Requirement 5.3).
 *
 * Network/IO boundaries are injectable: DNS verification lives behind the
 * `DnsResolverPort` on `DeliverabilityAuthService`, and the search index is the
 * injectable {@link EmailIndexerPort} (defaults to a no-op seam until the
 * `search-indexer` wiring lands).
 *
 * Requirements: 5.1 (record AuthVerdict), 5.2 (persist/thread/route/index on
 * pass), 5.3 (quarantine on DMARC-alignment failure).
 */

/**
 * Injectable seam for indexing a persisted inbound email into the search engine
 * (`search-indexer` → Qdrant/pgvector + Meilisearch). The production wiring is
 * introduced with the Answer Engine (Phase 5); until then the default is a no-op
 * so ingest remains fully functional.
 */
export interface EmailIndexerPort {
  index(email: Email): Promise<void>;
}

/** Default no-op indexer — the index call seam with no side effects. */
export class NoopEmailIndexer implements EmailIndexerPort {
  async index(_email: Email): Promise<void> {
    // Intentionally empty: real indexing is wired in Phase 5 (search-indexer).
  }
}

/**
 * Injectable seam for sending mail the ingest pipeline originates itself —
 * vacation auto-replies and filter "forward" actions. Decoupled from the
 * outbound delivery pipeline so ingest stays testable; production wiring passes
 * an adapter that enqueues onto the OutboundDeliveryPipeline.
 */
export interface InboundAutoResponderPort {
  send(input: {
    userId: string;
    to: string;
    subject: string;
    bodyPlain: string;
    inReplyTo?: string | null;
    kind: 'vacation-reply' | 'filter-forward';
  }): Promise<void>;
}

/**
 * Raw inbound message as bridged from `smtp-inbound` (a superset of its
 * `ParsedEmail`). The envelope/header/raw fields are optional because the SMTP
 * transport may not always surface them; SPF/DKIM/DMARC degrade gracefully when
 * an input is missing rather than failing ingest.
 */
export interface InboundRawMessage {
  /** `From:` header value (display name and/or address). */
  from: string;
  /** Envelope/header recipient addresses. */
  to: string[];
  cc?: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  date?: Date | null;
  hasAttachments?: boolean;
  attachments?: unknown[];
  /** Lowercased header name -> raw value, for DKIM verification. */
  headers?: Record<string, string>;
  /** Raw message body for the DKIM body hash. */
  rawBody?: string;
  /** SMTP envelope MAIL FROM (return-path), for SPF. */
  envelopeFrom?: string;
  /** Connecting client IP, for SPF. */
  clientIp?: string;
  /** HELO/EHLO domain, fallback SPF identity. */
  heloDomain?: string;
}

export interface InboundIngestDeps {
  email?: EmailService;
  thread?: ThreadService;
  indexer?: EmailIndexerPort;
  /**
   * Optional observability span port (Task 23.1, Req 23.2). When wired, each
   * `ingest` emits a `delivery.ingest_inbound` span; defaults to a no-op so the
   * adapter stays a zero-cost no-op when nothing is wired.
   */
  tracer?: SpanPort;
  /**
   * Optional server-side filters/rules engine. When provided, the user's
   * enabled filters are evaluated against each non-quarantined inbound message
   * and their merged actions (label/move/read/star/archive/spam/delete/forward)
   * are applied. Omitted => no filtering (legacy behaviour).
   */
  filters?: MailFilterService;
  /**
   * Optional vacation auto-responder. When provided (with an `autoResponder`),
   * a one-shot out-of-office reply is sent to eligible senders.
   */
  vacation?: VacationResponderService;
  /** Sink for ingest-originated mail (vacation replies, filter forwards). */
  autoResponder?: InboundAutoResponderPort;
}

/** Structural view of the folder lookups this adapter needs. */
interface FolderLookupPrisma {
  emailFolder: {
    findFirst(args: { where: { userId: string; type: string } }): Promise<{ id: string } | null>;
  };
  user: {
    findUnique(args: { where: { email: string } }): Promise<{ id: string } | null>;
  };
}

/**
 * Per-call overrides for {@link InboundIngestAdapter.ingest}.
 *
 * Both exist for the SES/SNS webhook, which knows things the SMTP bridge does
 * not. It has already resolved which local mailbox this copy is for (one message
 * addressed to two QuantMail users becomes two ingests), and SES has already run
 * SPF/DKIM/DMARC at SMTP time — re-running SPF here would evaluate it without
 * the connecting IP, which the raw message stored in S3 does not carry, and
 * would report a false `fail` for mail that genuinely passed.
 */
export interface IngestOptions {
  /** Deliver to this user instead of resolving one from the recipient list. */
  userId?: string;
  /** Use this verdict instead of authenticating the message here. */
  verdict?: AuthVerdict;
  /**
   * Force the spam routing decision.
   *
   * The adapter's own rule is DMARC alignment and nothing else. A caller that
   * knows more — the SES path has the spam and virus scanner verdicts from SMTP
   * time — can quarantine on that evidence without having to misreport DMARC as
   * failing in order to get the message into the spam folder.
   */
  quarantine?: boolean;
}

/**
 * Structural view of the duplicate lookup. Optional because the adapter's unit
 * tests supply only the delegates they exercise, and because the real guarantee
 * is the `(userId, messageId)` unique index — this pre-check only keeps a
 * redelivered notification from raising a constraint violation.
 */
interface DuplicateLookupPrisma {
  email?: {
    findFirst?(args: {
      where: { userId: string; messageId: string };
    }): Promise<{ id: string } | null>;
  };
}

/** Parse the display name from a `From:` header value, if present. */
function displayNameOf(headerFrom: string): string | null {
  const angle = headerFrom.indexOf('<');
  if (angle <= 0) {
    return null;
  }
  const name = headerFrom.slice(0, angle).trim().replace(/^"|"$/g, '').trim();
  return name.length > 0 ? name : null;
}

/** Strip a `+tag` sub-address so `user+x@d` resolves to the base mailbox `user@d`. */
function stripPlusTag(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) {
    return address;
  }
  const local = address.slice(0, at);
  const domain = address.slice(at);
  const plus = local.indexOf('+');
  return plus === -1 ? address : `${local.slice(0, plus)}${domain}`;
}

export class InboundIngestAdapter {
  private readonly email: EmailService;
  private readonly thread: ThreadService;
  private readonly indexer: EmailIndexerPort;
  private readonly tracer: SpanPort;
  private readonly filters: MailFilterService | undefined;
  private readonly vacation: VacationResponderService | undefined;
  private readonly autoResponder: InboundAutoResponderPort | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly auth: DeliverabilityAuthService,
    deps: InboundIngestDeps = {},
  ) {
    this.email = deps.email ?? new EmailService(prisma);
    this.thread = deps.thread ?? new ThreadService(prisma);
    this.indexer = deps.indexer ?? new NoopEmailIndexer();
    this.tracer = deps.tracer ?? noopSpanPort;
    this.filters = deps.filters;
    this.vacation = deps.vacation;
    this.autoResponder = deps.autoResponder;
  }

  /**
   * Decide whether a message must be quarantined: it fails DMARC *alignment* when
   * a DMARC policy is published for the From domain and neither SPF nor DKIM
   * aligns (`dmarc === 'fail'`). Absence of any DMARC record (`'none'`) is not a
   * failure and routes normally.
   */
  static shouldQuarantine(verdict: AuthVerdict): boolean {
    return verdict.dmarc === 'fail';
  }

  /**
   * Ingest one raw inbound message: authenticate, persist, thread, route, index.
   * Returns the persisted `Email` (with its AuthVerdict recorded), or the copy
   * already stored when the same Message-ID has been delivered to this mailbox
   * before — SNS redelivery must not duplicate mail.
   *
   * Every inbound delivery operation emits a `delivery.ingest_inbound` span
   * (Req 23.2): the span records the routing decision (quarantine vs. inbox) and
   * the auth verdict, and ends `error` if ingest throws (e.g. no local recipient).
   */
  async ingest(rawMessage: InboundRawMessage, options: IngestOptions = {}): Promise<Email> {
    return withSpan(
      this.tracer,
      'delivery.ingest_inbound',
      {
        'delivery.direction': 'inbound',
        'delivery.recipient_count': rawMessage.to.length,
      },
      async (span) => {
        // 1) Authenticate (SPF/DKIM/DMARC), unless the caller already holds a
        //    verdict from the transport that actually saw the SMTP connection.
        const verdict =
          options.verdict ?? (await this.auth.verifyInbound(this.toAuthMessage(rawMessage)));

        // 2) Resolve the local recipient mailbox -> user.
        const userId = options.userId ?? (await this.resolveRecipientUser(rawMessage.to));
        if (!userId) {
          throw createAppError(
            'No local recipient found for inbound message',
            404,
            'INBOUND_NO_RECIPIENT',
          );
        }

        // 2b) SNS delivers at least once, and a replay of the same notification
        //     must not produce a second copy in the mailbox. Keyed on the
        //     originating Message-ID, which is the only identifier that is stable
        //     across redeliveries.
        if (rawMessage.messageId) {
          const duplicate = await this.findByMessageId(userId, rawMessage.messageId);
          if (duplicate) {
            span.setAttributes({ 'delivery.duplicate': true, 'delivery.user_id': userId });
            return duplicate;
          }
        }

        // 3) Routing decision.
        const quarantine = options.quarantine ?? InboundIngestAdapter.shouldQuarantine(verdict);
        const folderId = await this.resolveFolder(userId, quarantine ? 'SPAM' : 'INBOX');

        // 4) Thread stitching (Requirement 5.2).
        const fromAddress = extractAddress(rawMessage.from) ?? rawMessage.from;
        const participants = [fromAddress, ...rawMessage.to.map((a) => a.toLowerCase())];
        const threadId = await this.thread.stitchInbound({
          userId,
          subject: rawMessage.subject,
          inReplyTo: rawMessage.inReplyTo ?? null,
          participants,
          at: rawMessage.date ?? new Date(),
        });

        // 5) Persist, recording the AuthVerdict + routing (Requirements 5.1/5.3).
        const text = rawMessage.text ?? null;
        const email = await this.email.receive({
          userId,
          folderId: folderId ?? '',
          fromAddress,
          fromName: displayNameOf(rawMessage.from) ?? undefined,
          toAddresses: rawMessage.to,
          ccAddresses: rawMessage.cc ?? [],
          subject: rawMessage.subject,
          bodyHtml: rawMessage.html ?? undefined,
          bodyPlain: text ?? undefined,
          snippet: (text ?? '').slice(0, 200),
          threadId,
          inReplyTo: rawMessage.inReplyTo ?? undefined,
          hasAttachments: rawMessage.hasAttachments ?? (rawMessage.attachments?.length ?? 0) > 0,
          attachments: rawMessage.attachments ?? [],
          receivedAt: rawMessage.date ?? new Date(),
          authResults: verdict as unknown,
          isSpam: quarantine,
          deliveryStatus: 'delivered',
        });

        // Persist the originating Message-ID so future replies thread correctly.
        if (rawMessage.messageId) {
          await this.prisma.email.update({
            where: { id: email.id },
            data: { messageId: rawMessage.messageId } as never,
          });
        }

        // 6) Apply the user's server-side filters/rules to non-quarantined mail.
        //    Filter actions may re-route the message (move/archive/spam), flag it
        //    (read/star), label it, forward it, or delete it. Best-effort: a
        //    filter failure must never break ingest of the (already persisted)
        //    message.
        let finalEmail = email;
        let filterSuppressedIndex = false;
        if (this.filters && !quarantine) {
          try {
            const actions = await this.filters.computeActions(userId, {
              fromAddress,
              toAddresses: rawMessage.to,
              subject: rawMessage.subject,
              bodyPlain: text,
              bodyHtml: rawMessage.html ?? null,
              hasAttachments:
                rawMessage.hasAttachments ?? (rawMessage.attachments?.length ?? 0) > 0,
            });
            if (actions.matchedFilterIds.length > 0) {
              finalEmail = await this.applyFilterActions(userId, email, actions);
              filterSuppressedIndex = actions.delete === true || actions.markSpam === true;
              await this.forwardViaFilters(userId, finalEmail, actions, rawMessage);
            }
            span.setAttributes({ 'delivery.matched_filters': actions.matchedFilterIds.length });
          } catch {
            // Swallow: the message is already safely persisted.
          }
        }

        // 7) Index only authenticated mail that wasn't spam'd/deleted by a filter
        //    (Requirement 5.2).
        if (!quarantine && !filterSuppressedIndex) {
          await this.indexer.index(finalEmail);
        }

        // 8) Vacation auto-responder: send a one-shot out-of-office reply to
        //    eligible senders (service enforces window/contacts/interval/
        //    automated-sender rules). Best-effort and never blocks ingest.
        if (this.vacation && this.autoResponder && !quarantine && !filterSuppressedIndex) {
          try {
            const now = rawMessage.date ?? new Date();
            const reply = await this.vacation.buildAutoReply(userId, fromAddress, now);
            if (reply) {
              await this.autoResponder.send({
                userId,
                to: fromAddress,
                subject: reply.subject,
                bodyPlain: reply.message,
                inReplyTo: rawMessage.messageId ?? null,
                kind: 'vacation-reply',
              });
            }
          } catch {
            // Swallow: auto-reply is best-effort.
          }
        }

        span.setAttributes({
          'delivery.user_id': userId,
          'delivery.quarantined': quarantine,
          'delivery.dmarc': verdict.dmarc,
          'delivery.indexed': !quarantine && !filterSuppressedIndex,
        });

        return finalEmail;
      },
    );
  }

  /** Map the bridged raw message into the auth service's verification shape. */
  private toAuthMessage(rawMessage: InboundRawMessage): InboundAuthMessage {
    const headers = rawMessage.headers ?? {};
    const headerFrom = headers['from'] ?? rawMessage.from;
    const rawBody = rawMessage.rawBody ?? rawMessage.text ?? rawMessage.html ?? '';
    return {
      headerFrom,
      headers,
      rawBody,
      ...(rawMessage.envelopeFrom !== undefined ? { envelopeFrom: rawMessage.envelopeFrom } : {}),
      ...(rawMessage.clientIp !== undefined ? { clientIp: rawMessage.clientIp } : {}),
      ...(rawMessage.heloDomain !== undefined ? { heloDomain: rawMessage.heloDomain } : {}),
    };
  }

  /**
   * A message already delivered to this mailbox under the same Message-ID, if
   * any. Absent `email.findFirst` (unit-test doubles) means "not a duplicate":
   * the unique index is the real guard, this is only noise suppression.
   */
  private async findByMessageId(userId: string, messageId: string): Promise<Email | null> {
    const db = this.prisma as unknown as DuplicateLookupPrisma;
    const finder = db.email?.findFirst;
    if (typeof finder !== 'function') {
      return null;
    }
    try {
      const found = await finder.call(db.email, { where: { userId, messageId } });
      return (found as Email | null) ?? null;
    } catch {
      return null;
    }
  }

  /** Resolve the first recipient address that maps to a known local user. */
  private async resolveRecipientUser(recipients: string[]): Promise<string | null> {
    const db = this.prisma as unknown as FolderLookupPrisma;
    for (const raw of recipients) {
      const address = stripPlusTag((extractAddress(raw) ?? raw).toLowerCase());
      const user = await db.user.findUnique({ where: { email: address } });
      if (user) {
        return user.id;
      }
    }
    return null;
  }

  /** Find the recipient's folder of the given type (INBOX/SPAM/ARCHIVE/TRASH). */
  private async resolveFolder(
    userId: string,
    type: 'INBOX' | 'SPAM' | 'ARCHIVE' | 'TRASH',
  ): Promise<string | null> {
    const db = this.prisma as unknown as FolderLookupPrisma;
    const folder = await db.emailFolder.findFirst({ where: { userId, type } });
    return folder?.id ?? null;
  }

  /**
   * Apply the merged {@link ResolvedActions} from the filter engine to a freshly
   * persisted email via a single update. Precedence for routing: delete > spam >
   * archive > explicit move. Labels are appended (deduped); flags are set when
   * requested.
   */
  private async applyFilterActions(
    userId: string,
    email: Email,
    actions: ResolvedActions,
  ): Promise<Email> {
    const data: Record<string, unknown> = {};

    if (actions.markRead) data['isRead'] = true;
    if (actions.star) data['isStarred'] = true;

    if (actions.addLabelIds.length > 0) {
      const current =
        ((email as unknown as { labels?: unknown }).labels as string[] | undefined) ?? [];
      data['labels'] = Array.from(new Set([...current, ...actions.addLabelIds]));
    }

    // Routing — highest-precedence destination wins.
    if (actions.delete) {
      data['isTrash'] = true;
      data['deletedAt'] = new Date();
      const trash = await this.resolveFolder(userId, 'TRASH');
      if (trash) data['folderId'] = trash;
    } else if (actions.markSpam) {
      data['isSpam'] = true;
      const spam = await this.resolveFolder(userId, 'SPAM');
      if (spam) data['folderId'] = spam;
    } else if (actions.archive) {
      const archive = await this.resolveFolder(userId, 'ARCHIVE');
      if (archive) data['folderId'] = archive;
    } else if (actions.moveToFolderId) {
      data['folderId'] = actions.moveToFolderId;
    }

    if (Object.keys(data).length === 0) {
      return email;
    }

    const updated = await this.prisma.email.update({
      where: { id: email.id },
      data: data as never,
    });
    return updated;
  }

  /** Forward the message to any addresses requested by matching filters. */
  private async forwardViaFilters(
    userId: string,
    email: Email,
    actions: ResolvedActions,
    rawMessage: InboundRawMessage,
  ): Promise<void> {
    if (!this.autoResponder || !actions.forwardTo || actions.forwardTo.length === 0) {
      return;
    }
    const subject = `Fwd: ${rawMessage.subject}`;
    const body = rawMessage.text ?? rawMessage.html ?? '';
    for (const to of actions.forwardTo) {
      try {
        await this.autoResponder.send({
          userId,
          to,
          subject,
          bodyPlain: body,
          inReplyTo: rawMessage.messageId ?? null,
          kind: 'filter-forward',
        });
      } catch {
        // Best-effort per recipient.
      }
    }
  }
}
