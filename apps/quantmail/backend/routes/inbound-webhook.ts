/**
 * POST /webhook/inbound
 *
 * AWS SNS → SES inbound email.
 *
 * Flow:
 *  1. Verify the SNS signature. On a public endpoint that is the *only*
 *     authentication there is.
 *  2. `SubscriptionConfirmation` → confirm by GETting the SNS-supplied URL, after
 *     checking it really is an AWS SNS URL.
 *  3. `Notification` → read the SES receipt, fetch the raw message from the
 *     configured S3 bucket, parse it, and hand each local recipient's copy to
 *     {@link InboundIngestAdapter} — the same pipeline the SMTP bridge uses. That
 *     is where DMARC quarantine, thread stitching, Message-ID idempotency and the
 *     search-index hook live. This route used to insert rows directly and so had
 *     none of it.
 *
 * What this route deliberately does not trust, and why:
 *  - **the `x-amz-sns-message-type` header** — the sender picks it, so it is a
 *    logging hint and never a decision input;
 *  - **a bucket name from the request body** — an S3 read runs with the service's
 *    IAM role, so a bucket an attacker names is an arbitrary read of anything that
 *    role can see. Only the configured allowlist is used;
 *  - **a recipient the message does not name** — when the previous version found
 *    no address in a QuantMail domain it invented `<handle>@quantmail.in` from
 *    whatever the To header said, which let one forged notification be aimed at
 *    any user by handle. A message with no local recipient is now dropped.
 *
 * This route is PUBLIC (no JWT) because SNS cannot present a bearer token, and is
 * listed in `publicPaths` in app.ts. The replay/backfill endpoint is *not* public:
 * it lives at `/admin/inbound/sync-all` and requires an ADMIN user. As
 * `publicPaths` matches by path prefix, it could not stay under `/webhook/inbound`
 * without inheriting that exemption — which is how it came to be an
 * unauthenticated "replay the whole bucket into everyone's inbox" button.
 */

import type { FastifyInstance } from 'fastify';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '@quant/database';
import { parseRawEmail, type ParsedEmail } from '../lib/mime-parser';
import { trustedSnsSubscribeUrl, verifySnsMessage, type SnsEnvelope } from '../lib/sns-verifier';
import {
  DeliverabilityAuthService,
  type AuthResult,
  type AuthVerdict,
} from '../services/deliverability-auth.service';
import { InboundIngestAdapter, type InboundRawMessage } from '../services/inbound-ingest.service';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const S3_BUCKET = process.env['INBOUND_S3_BUCKET'] ?? 'quantmail-inbound-emails';
const s3 = new S3Client({ region: REGION });

const QUANTMAIL_DOMAINS = ['quantmail.in', 'quantrinity.in', 'quantchat.online'];

// ---------------------------------------------------------------------------
// Configuration, read per request so a redeploy is not needed to change it
// ---------------------------------------------------------------------------

function csvEnv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Buckets an inbound notification may name. `INBOUND_S3_BUCKET` is always in the
 * set; `INBOUND_S3_BUCKETS` exists only so a region migration can accept both the
 * old and the new bucket for a window.
 */
function allowedBuckets(): Set<string> {
  return new Set([S3_BUCKET, ...csvEnv('INBOUND_S3_BUCKETS')]);
}

/**
 * Topics allowed to publish here. Unset means "any topic with a valid AWS
 * signature", which is a deliberate soft-fail: a signature already proves the
 * message came from SNS, and hard-failing on an unset variable would silently
 * stop live mail the moment this deploys. The unset case logs the ARN it saw so
 * the value can be filled in from production traffic.
 */
function allowedTopicArns(): string[] {
  return csvEnv('INBOUND_SNS_TOPIC_ARNS');
}

/**
 * Local-only escape hatch for replaying a captured notification against a dev
 * machine, where there is no AWS signature to check. Refused outright in
 * production — the whole point of the signature is that this endpoint is public.
 */
function unsignedAllowed(): boolean {
  return (
    process.env['NODE_ENV'] !== 'production' &&
    process.env['INBOUND_WEBHOOK_ALLOW_UNSIGNED'] === 'true'
  );
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

/** `bob+newsletters@quantmail.in` → `bob@quantmail.in`. */
function stripPlusTag(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) {
    return address;
  }
  const local = address.slice(0, at);
  const plus = local.indexOf('+');
  return plus === -1 ? address : `${local.slice(0, plus)}@${address.slice(at + 1)}`;
}

function isQuantMailAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  return at > 0 && QUANTMAIL_DOMAINS.includes(address.slice(at + 1));
}

interface LocalUser {
  id: string;
  email: string;
  username: string;
}

/**
 * The users this message is genuinely addressed to.
 *
 * A handle match (`bob@quantrinity.in` → the user whose username is `bob`) is how
 * QuantMail aliases work, but it is only ever attempted for an address that is
 * *already* in one of our own domains. That single condition is the difference
 * between an alias system and the previous behaviour, which took the handle out of
 * any address at all — including an attacker-controlled one — and appended
 * `@quantmail.in` to it.
 */
async function resolveLocalUsers(addresses: string[]): Promise<LocalUser[]> {
  const local = [
    ...new Set(
      addresses
        .map((address) => stripPlusTag(address.trim().toLowerCase()))
        .filter((address) => isQuantMailAddress(address)),
    ),
  ];
  if (local.length === 0) {
    return [];
  }
  const handles = [...new Set(local.map((address) => address.split('@')[0] ?? ''))].filter(Boolean);
  const db = prisma as unknown as {
    user: { findMany(args: unknown): Promise<LocalUser[]> };
  };
  return db.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ email: { in: local } }, { username: { in: handles } }],
    },
    select: { id: true, email: true, username: true },
  });
}

// ---------------------------------------------------------------------------
// SES receipt → AuthVerdict
// ---------------------------------------------------------------------------

/**
 * The parts of the SES notification this route reads. Everything is optional: SES
 * omits verdicts for actions that never ran, and the shape has to survive a body
 * that has been signed but is still older or newer than this code.
 */
interface SesVerdict {
  status?: string;
}

interface SesReceipt {
  recipients?: string[];
  spfVerdict?: SesVerdict;
  dkimVerdict?: SesVerdict;
  dmarcVerdict?: SesVerdict;
  dmarcPolicy?: string;
  spamVerdict?: SesVerdict;
  virusVerdict?: SesVerdict;
  action?: { type?: string; bucketName?: string; objectKey?: string };
}

interface SesNotification {
  notificationType?: string;
  mail?: { messageId?: string; source?: string; destination?: string[] };
  receipt?: SesReceipt;
}

const SES_VERDICTS: Record<string, AuthResult> = {
  PASS: 'pass',
  FAIL: 'fail',
  GRAY: 'neutral',
  PROCESSING_FAILED: 'temperror',
};

function sesResult(verdict: SesVerdict | undefined): AuthResult {
  const status = verdict?.status?.toUpperCase();
  if (!status) {
    return 'none';
  }
  return SES_VERDICTS[status] ?? 'none';
}

/**
 * Translate what SES already decided into the verdict shape the ingest pipeline
 * records.
 *
 * SES's verdicts are used rather than re-running {@link DeliverabilityAuthService}
 * on the stored message, because **SPF cannot be re-checked after the fact**: it is
 * a statement about the IP that connected, and the raw message sitting in S3 does
 * not carry it. Re-verifying would produce a confident `fail` for mail that
 * genuinely passed. SES ran all three checks at SMTP time with the real client IP.
 *
 * SES reports no per-mechanism alignment, so `spfAligned`/`dkimAligned` are derived
 * from its DMARC verdict: a DMARC pass means at least one mechanism was aligned, so
 * a mechanism that passed *and* a passing DMARC is the closest honest reading. The
 * domains are left null rather than guessed.
 */
function verdictFromReceipt(receipt: SesReceipt | undefined, fromAddress: string): AuthVerdict {
  const spf = sesResult(receipt?.spfVerdict);
  const dkim = sesResult(receipt?.dkimVerdict);
  const dmarc = sesResult(receipt?.dmarcVerdict);
  const at = fromAddress.lastIndexOf('@');
  return {
    spf,
    dkim,
    dmarc,
    aligned: dmarc === 'pass',
    details: {
      spfDomain: null,
      dkimDomain: null,
      fromDomain: at > 0 ? fromAddress.slice(at + 1).toLowerCase() : null,
      spfAligned: dmarc === 'pass' && spf === 'pass',
      dkimAligned: dmarc === 'pass' && dkim === 'pass',
      dmarcPolicy: receipt?.dmarcPolicy?.toLowerCase() ?? null,
    },
  };
}

/**
 * Whether this message belongs in spam rather than the inbox.
 *
 * DMARC failure is the ingest adapter's own rule and is repeated here so the two
 * inputs combine in one place. SES's spam and virus scanners are added because a
 * message that fails either has no business in an inbox even when it authenticates
 * perfectly — and the previous version recorded their verdicts and then ignored
 * them, honouring only `spamVerdict` and only by setting an `isSpam` flag on a row
 * that still landed in the inbox.
 */
function shouldQuarantine(verdict: AuthVerdict, receipt: SesReceipt | undefined): boolean {
  if (verdict.dmarc === 'fail') {
    return true;
  }
  return (
    receipt?.spamVerdict?.status?.toUpperCase() === 'FAIL' ||
    receipt?.virusVerdict?.status?.toUpperCase() === 'FAIL'
  );
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/** Read an S3 object as a UTF-8 string. */
async function fetchRawEmail(bucket: string, key: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body as
    | { transformToString?: (enc?: string) => Promise<string> }
    | undefined;
  if (!body?.transformToString) {
    throw new Error(`s3://${bucket}/${key} returned an empty body`);
  }
  return body.transformToString('utf-8');
}

/**
 * One adapter for the process. Built lazily so importing this module does not
 * construct a Prisma-backed service graph at import time — the route tests import
 * the module to register routes without a database behind them.
 */
let adapterSingleton: InboundIngestAdapter | undefined;

function ingestAdapter(): InboundIngestAdapter {
  if (!adapterSingleton) {
    const db = prisma as unknown as ConstructorParameters<typeof InboundIngestAdapter>[0];
    adapterSingleton = new InboundIngestAdapter(db, new DeliverabilityAuthService(db));
  }
  return adapterSingleton;
}

/** Exposed for tests, which need a fresh adapter over a mocked Prisma client. */
export function __setInboundIngestAdapter(adapter: InboundIngestAdapter | undefined): void {
  adapterSingleton = adapter;
}

/**
 * Map a parsed message onto the pipeline's input shape.
 *
 * `hasAttachments` counts only downloadable parts: a `cid:` image referenced from
 * the HTML body is part of the body, and showing a paperclip for it is the kind of
 * small lie that teaches users to distrust the indicator.
 */
function toRawMessage(parsed: ParsedEmail, recipients: string[]): InboundRawMessage {
  const downloadable = parsed.attachments.filter((attachment) => !attachment.isInline);
  return {
    from: parsed.fromName ? `${parsed.fromName} <${parsed.fromAddress}>` : parsed.fromAddress,
    to: parsed.toAddresses.length > 0 ? parsed.toAddresses : recipients,
    cc: parsed.ccAddresses,
    subject: parsed.subject || '(no subject)',
    html: parsed.bodyHtml || null,
    text: parsed.bodyPlain || null,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    date: parsed.date ?? null,
    hasAttachments: downloadable.length > 0,
    attachments: parsed.attachments,
    headers: parsed.headers,
  };
}

interface DeliveryOutcome {
  key: string;
  delivered: number;
  /** Set when the message was intentionally not delivered to anyone. */
  skipped?: 'no-local-recipient';
}

/**
 * Fetch one stored message and hand a copy to every local recipient.
 *
 * Throws when a recipient's ingest fails, so the caller can answer non-2xx and let
 * SNS redeliver: the `(userId, messageId)` idempotency check makes that retry safe
 * for the copies that already landed, and swallowing the error instead would lose
 * the mail with nothing but a log line to show for it.
 */
async function deliverStoredMessage(
  log: FastifyInstance['log'],
  bucket: string,
  key: string,
  receipt: SesReceipt | undefined,
): Promise<DeliveryOutcome> {
  const rawEmail = await fetchRawEmail(bucket, key);
  const parsed = parseRawEmail(rawEmail);

  // The receipt's recipient list is what SES actually accepted. Headers can say
  // anything, and a Bcc'd recipient appears in neither To nor Cc — reading only the
  // headers is how blind copies get dropped.
  const addressed = [...(receipt?.recipients ?? []), ...parsed.toAddresses, ...parsed.ccAddresses];
  const users = await resolveLocalUsers(addressed);
  if (users.length === 0) {
    log.warn(
      { key, addressed: addressed.length },
      '[inbound] no local recipient — message dropped',
    );
    return { key, delivered: 0, skipped: 'no-local-recipient' };
  }

  const verdict = verdictFromReceipt(receipt, parsed.fromAddress);
  const quarantine = shouldQuarantine(verdict, receipt);
  const raw = toRawMessage(
    parsed,
    users.map((user) => user.email),
  );

  const failures: string[] = [];
  let delivered = 0;
  for (const user of users) {
    try {
      await ingestAdapter().ingest(raw, { userId: user.id, verdict, quarantine });
      delivered += 1;
    } catch (error) {
      failures.push(user.id);
      log.error({ err: error, key, userId: user.id }, '[inbound] ingest failed for recipient');
    }
  }
  if (failures.length > 0) {
    throw new Error(`ingest failed for ${failures.length} of ${users.length} recipients`);
  }
  log.info({ key, delivered, quarantine, dmarc: verdict.dmarc }, '[inbound] delivered');
  return { key, delivered };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default async function inboundWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhook/inbound', async (request, reply) => {
    const sns = (request.body ?? {}) as SnsEnvelope;

    // The header is logged beside the body's own `Type` precisely because they can
    // disagree: only the body's value is covered by the signature.
    app.log.info(
      {
        type: sns.Type,
        headerType: request.headers['x-amz-sns-message-type'],
        topicArn: sns.TopicArn,
        messageId: sns.MessageId,
      },
      '[inbound] SNS request received',
    );

    // 1) Authenticate. Nothing in the body is trusted until this passes.
    if (unsignedAllowed()) {
      app.log.warn('[inbound] SNS signature check bypassed — development only');
    } else {
      const verified = await verifySnsMessage(sns);
      if (!verified.ok) {
        app.log.warn(
          { reason: verified.reason, detail: verified.detail, topicArn: sns.TopicArn },
          '[inbound] rejected: SNS signature did not verify',
        );
        // Opaque to the caller: a forger learns nothing about which check failed.
        return reply.status(403).send({ ok: false, error: 'FORBIDDEN' });
      }
    }

    // 2) Bind to our own topic where configured.
    const topics = allowedTopicArns();
    if (topics.length === 0) {
      app.log.warn(
        { topicArn: sns.TopicArn },
        '[inbound] INBOUND_SNS_TOPIC_ARNS is unset — any signed SNS topic is accepted. Set it to this ARN.',
      );
    } else if (!sns.TopicArn || !topics.includes(sns.TopicArn)) {
      app.log.warn({ topicArn: sns.TopicArn }, '[inbound] rejected: TopicArn not allowlisted');
      return reply.status(403).send({ ok: false, error: 'FORBIDDEN' });
    }

    // 3) Subscription handshake.
    if (sns.Type === 'SubscriptionConfirmation') {
      // `trustedSnsSubscribeUrl` rebuilds the callback from validated parts and
      // not `startsWith('https://sns.')`, which `https://sns.attacker.example/`
      // also satisfies. Binding it to the envelope's own `TopicArn` — already
      // allowlisted in step 2 — means a signed message cannot make us confirm a
      // subscription to somebody else's topic either.
      const subscribeUrl = trustedSnsSubscribeUrl(sns.SubscribeURL, sns.TopicArn);
      if (subscribeUrl === null) {
        app.log.warn(
          { subscribeUrl: sns.SubscribeURL },
          '[inbound] rejected: SubscribeURL is not an AWS SNS confirm URL for this topic',
        );
        return reply.status(403).send({ ok: false, error: 'FORBIDDEN' });
      }
      try {
        const response = await fetch(subscribeUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        app.log.info({ status: response.status }, '[inbound] SNS subscription confirmed');
      } catch (error) {
        app.log.error({ err: error }, '[inbound] SNS subscription confirmation failed');
        return reply.status(502).send({ ok: false, error: 'CONFIRMATION_FAILED' });
      }
      return reply.send({ ok: true, confirmed: true });
    }

    if (sns.Type === 'UnsubscribeConfirmation') {
      app.log.warn({ topicArn: sns.TopicArn }, '[inbound] SNS unsubscribe confirmation received');
      return reply.send({ ok: true });
    }

    if (sns.Type !== 'Notification') {
      // Unreachable: `verifySnsMessage` rejects any other type. Kept so the
      // dev-only unsigned path cannot fall through into notification handling.
      return reply.status(400).send({ ok: false, error: 'UNSUPPORTED_TYPE' });
    }

    // 4) Read the SES receipt out of the signed payload.
    let ses: SesNotification;
    try {
      ses = JSON.parse(sns.Message ?? '{}') as SesNotification;
    } catch (error) {
      app.log.error({ err: error }, '[inbound] SNS Message is not JSON');
      return reply.send({ ok: true, ignored: 'unparseable-message' });
    }
    const receipt = ses.receipt;
    const action = receipt?.action;

    // 5) Resolve the object. `action.bucketName` sits inside the signed SES payload
    // rather than the outer envelope, but it is still checked against the
    // allowlist: the previous version fell back to `sns.bucket` — a plain
    // request-body field — and an S3 read runs with the service's IAM role, so a
    // bucket the caller names is an arbitrary read of anything that role can see.
    const bucket = action?.bucketName ?? S3_BUCKET;
    if (!allowedBuckets().has(bucket)) {
      app.log.error({ bucket }, '[inbound] refusing to read a bucket that is not allowlisted');
      return reply.send({ ok: true, ignored: 'bucket-not-allowlisted' });
    }
    const key =
      action?.objectKey ?? (ses.mail?.messageId ? `emails/${ses.mail.messageId}` : undefined);
    if (!key) {
      app.log.warn({ notificationType: ses.notificationType }, '[inbound] no S3 object key');
      return reply.send({ ok: true, ignored: 'no-object-key' });
    }

    // 6) Deliver through the shared ingest pipeline.
    try {
      const outcome = await deliverStoredMessage(app.log, bucket, key, receipt);
      return reply.send({ ok: true, ...outcome });
    } catch (error) {
      // Non-2xx so SNS redelivers. Idempotency on `(userId, messageId)` makes the
      // retry safe for any copy that already landed.
      app.log.error({ err: error, bucket, key }, '[inbound] delivery failed — SNS will retry');
      return reply.status(500).send({ ok: false, error: 'DELIVERY_FAILED' });
    }
  });

  /**
   * POST /admin/inbound/sync-all — replay stored messages from the inbound bucket.
   *
   * A recovery tool for the case where notifications were lost: it re-reads objects
   * and re-runs delivery, which is only safe to expose at all because ingest is now
   * idempotent on `(userId, messageId)`.
   *
   * It lives under `/admin` for a structural reason rather than a stylistic one:
   * `publicPaths` matches by prefix, so anything under `/webhook/inbound/` inherits
   * that route's JWT exemption. At its old path this was an unauthenticated "replay
   * the entire bucket into everyone's inbox" button, and no amount of checking
   * inside the handler could have fixed that while the path stayed where it was.
   *
   * Replayed messages carry an all-`none` auth verdict: the SES receipt is not in
   * the stored object, and inventing a `pass` for mail whose SPF result nobody can
   * still determine would be worse than recording that it is unknown.
   */
  app.post('/admin/inbound/sync-all', async (request, reply) => {
    const actorId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!actorId) {
      return reply.status(401).send({ ok: false, error: 'UNAUTHORIZED' });
    }
    const db = prisma as unknown as {
      user: { findUnique(args: unknown): Promise<{ role: string } | null> };
    };
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (actor?.role !== 'ADMIN') {
      app.log.warn({ actorId, role: actor?.role }, '[inbound] sync-all refused: not an admin');
      return reply.status(403).send({ ok: false, error: 'FORBIDDEN' });
    }

    const body = (request.body ?? {}) as { prefix?: unknown; limit?: unknown };
    const prefix = typeof body.prefix === 'string' && body.prefix ? body.prefix : 'emails/';
    const requested = Number(body.limit);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 200, 1), 2000);

    const keys: string[] = [];
    let continuationToken: string | undefined;
    try {
      // ListObjectsV2 caps a page at 1000 keys, so the previous single call
      // silently stopped there and reported success for a partial replay.
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            MaxKeys: Math.min(1000, limit - keys.length),
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key) {
            keys.push(object.Key);
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken && keys.length < limit);
    } catch (error) {
      app.log.error({ err: error, prefix }, '[inbound] sync-all could not list the bucket');
      return reply.status(502).send({ ok: false, error: 'LIST_FAILED' });
    }

    let delivered = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const key of keys) {
      try {
        const outcome = await deliverStoredMessage(app.log, S3_BUCKET, key, undefined);
        delivered += outcome.delivered;
        if (outcome.skipped) {
          skipped += 1;
        }
      } catch (error) {
        failed.push(key);
        app.log.error({ err: error, key }, '[inbound] sync-all could not deliver an object');
      }
    }

    app.log.info(
      { actorId, scanned: keys.length, delivered, skipped, failed: failed.length },
      '[inbound] sync-all complete',
    );
    return reply.send({
      ok: true,
      scanned: keys.length,
      delivered,
      skipped,
      failed: failed.length,
    });
  });
}
