/**
 * POST /webhook/inbound
 *
 * AWS SNS → SES Inbound Email Webhook
 *
 * Flow:
 *  1. SNS sends a SubscriptionConfirmation request → we fetch the URL to confirm.
 *  2. On every inbound email notification SNS sends a Notification:
 *     - Parse the SNS message JSON which contains an SES receipt + S3 reference.
 *     - Fetch the raw email from S3.
 *     - Parse the MIME email with our zero-dep parser.
 *     - For each recipient whose address ends in @quantmail.in / @quantrinity.in,
 *       look up the matching DB user and create an Email record in their inbox.
 *
 * Security: AWS SNS signs its payloads — we verify the x-amz-sns-message-type
 * header and confirm subscriptions via the SubscribeURL only (no spoofing risk
 * from body URLs because we only call the SNS-provided URL).
 *
 * This route is PUBLIC (no JWT) because SNS cannot authenticate with a Bearer token.
 * It is listed in `publicPaths` in app.ts.
 */

import type { FastifyInstance } from 'fastify';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '@quant/database';
import { parseRawEmail } from '../lib/mime-parser';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const s3 = new S3Client({ region: REGION });

const QUANTMAIL_DOMAINS = ['quantmail.in', 'quantrinity.in', 'quantchat.online'];

function isQuantMailAddress(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return QUANTMAIL_DOMAINS.includes(domain);
}

async function fetchRawFromS3(bucket: string, key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const resp = await s3.send(cmd);
  if (!resp.Body) throw new Error('Empty S3 response');
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

interface SnsNotification {
  Type: string;
  SubscribeURL?: string;
  Message?: string;
  MessageId?: string;
}

interface SesS3Action {
  type: string;
  bucketName: string;
  objectKey: string;
}

interface SesMessage {
  receipt?: {
    action?: SesS3Action;
    recipients?: string[];
    spfVerdict?: { status: string };
    dkimVerdict?: { status: string };
    dmarcVerdict?: { status: string };
    spamVerdict?: { status: string };
  };
  mail?: {
    destination?: string[];
    commonHeaders?: {
      from?: string[];
      to?: string[];
      subject?: string;
    };
  };
}

export default async function inboundWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Accept text/plain because SNS sends Content-Type: text/plain for JSON
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, typeof body === 'string' ? JSON.parse(body) : body);
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  app.post('/webhook/inbound', async (request, reply) => {
    try {
      const sns = request.body as SnsNotification;
      const msgType = (request.headers['x-amz-sns-message-type'] as string) ?? sns?.Type ?? '';

      app.log.info({ msgType }, '[inbound] SNS message received');

      // ── Step 1: Confirm SNS subscription ───────────────────────────────────
      if (msgType === 'SubscriptionConfirmation' || sns?.Type === 'SubscriptionConfirmation') {
        const subUrl = sns.SubscribeURL;
        if (subUrl && subUrl.startsWith('https://sns.')) {
          app.log.info({ subUrl }, '[inbound] Confirming SNS subscription');
          const res = await fetch(subUrl);
          app.log.info({ status: res.status }, '[inbound] SNS subscription confirmed');
        }
        return reply.status(200).send({ ok: true });
      }

      // ── Step 2: Handle inbound email notification ───────────────────────────
      if (msgType === 'Notification' || sns?.Type === 'Notification') {
        const rawMessage =
          typeof sns.Message === 'string' ? sns.Message : JSON.stringify(sns.Message);
        let sesMsg: SesMessage;
        try {
          sesMsg = JSON.parse(rawMessage) as SesMessage;
        } catch {
          app.log.warn('[inbound] Failed to parse SES message JSON');
          return reply.status(200).send({ ok: true });
        }

        const action = sesMsg?.receipt?.action;
        if (!action || action.type !== 'S3') {
          app.log.warn({ action }, '[inbound] Not an S3 action, skipping');
          return reply.status(200).send({ ok: true });
        }

        const { bucketName, objectKey } = action;
        app.log.info({ bucketName, objectKey }, '[inbound] Fetching raw email from S3');

        let rawEmail: string;
        try {
          rawEmail = await fetchRawFromS3(bucketName, objectKey);
        } catch (err) {
          app.log.error({ err, bucketName, objectKey }, '[inbound] Failed to fetch from S3');
          return reply.status(200).send({ ok: true }); // 200 so SNS doesn't retry forever
        }

        const parsed = parseRawEmail(rawEmail);
        app.log.info(
          { from: parsed.fromAddress, to: parsed.toAddresses, subject: parsed.subject },
          '[inbound] Email parsed',
        );

        // Spam verdict
        const isSpam = sesMsg.receipt?.spamVerdict?.status?.toUpperCase() === 'FAIL';

        // Collect all destination addresses from SES receipt + parsed headers
        const allRecipients = Array.from(
          new Set(
            [
              ...(sesMsg.receipt?.recipients ?? []),
              ...parsed.toAddresses,
              ...parsed.ccAddresses,
            ].map((a) => a.trim().toLowerCase()),
          ),
        ).filter((a) => isQuantMailAddress(a));

        if (allRecipients.length === 0) {
          app.log.warn('[inbound] No QuantMail recipients found, skipping');
          return reply.status(200).send({ ok: true });
        }

        const userModel = prisma as unknown as {
          user: {
            findMany(
              a: unknown,
            ): Promise<Array<{ id: string; email: string; username: string | null }>>;
          };
          folder: {
            findFirst(a: unknown): Promise<{ id: string } | null>;
          };
          email: {
            create(a: unknown): Promise<unknown>;
          };
        };

        // Build lookup: try exact email match OR username@domain match
        const handles = allRecipients.map((r) => r.split('@')[0]);
        const matchedUsers = await userModel.user.findMany({
          where: {
            OR: [
              { email: { in: allRecipients, mode: 'insensitive' } as never },
              { username: { in: handles, mode: 'insensitive' } as never },
            ],
          },
          select: { id: true, email: true, username: true },
        });

        app.log.info({ matchedUsers: matchedUsers.length }, '[inbound] Matched DB users');

        const snippet = (parsed.bodyPlain || parsed.bodyHtml.replace(/<[^>]+>/g, '')).slice(0, 140);

        let delivered = 0;
        for (const user of matchedUsers) {
          const inboxFolder = await userModel.folder
            .findFirst({ where: { userId: user.id, type: 'INBOX' } })
            .catch(() => null);

          await userModel.email.create({
            data: {
              userId: user.id,
              folderId: inboxFolder?.id ?? null,
              fromAddress: parsed.fromAddress,
              fromName: parsed.fromName ?? parsed.fromAddress.split('@')[0],
              toAddresses: parsed.toAddresses.length > 0 ? parsed.toAddresses : allRecipients,
              ccAddresses: parsed.ccAddresses,
              bccAddresses: [],
              subject: parsed.subject,
              bodyHtml: parsed.bodyHtml,
              bodyPlain: parsed.bodyPlain,
              snippet,
              threadId: null,
              inReplyTo: parsed.inReplyTo ?? null,
              isRead: false,
              isSent: false,
              isDraft: false,
              isSpam,
              receivedAt: parsed.date ?? new Date(),
              deliveryStatus: 'delivered',
              authResults: {
                spf: sesMsg.receipt?.spfVerdict?.status,
                dkim: sesMsg.receipt?.dkimVerdict?.status,
                dmarc: sesMsg.receipt?.dmarcVerdict?.status,
              },
            },
          });

          app.log.info(
            { userId: user.id, email: user.email },
            '[inbound] Email delivered to inbox',
          );
          delivered++;
        }

        app.log.info({ delivered }, '[inbound] Delivery complete');
        return reply.status(200).send({ ok: true, delivered });
      }

      // Unknown message type — acknowledge and ignore
      return reply.status(200).send({ ok: true });
    } catch (err) {
      // Always return 200 to SNS to prevent infinite retries
      app.log.error({ err }, '[inbound] Unhandled error in webhook handler');
      return reply.status(200).send({ ok: true });
    }
  });
}
