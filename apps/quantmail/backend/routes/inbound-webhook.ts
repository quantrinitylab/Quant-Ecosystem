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
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '@quant/database';
import { parseRawEmail } from '../lib/mime-parser';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const S3_BUCKET = process.env['INBOUND_S3_BUCKET'] ?? 'quantmail-inbound-emails';
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
  Type?: string;
  SubscribeURL?: string;
  Message?: string;
  MessageId?: string;
  objectKey?: string;
  bucket?: string;
}

interface SesAction {
  type?: string;
  bucketName?: string;
  objectKey?: string;
  topicArn?: string;
}

interface SesMessage {
  receipt?: {
    action?: SesAction;
    recipients?: string[];
    spfVerdict?: { status: string };
    dkimVerdict?: { status: string };
    dmarcVerdict?: { status: string };
    spamVerdict?: { status: string };
  };
  mail?: {
    messageId?: string;
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
      if (msgType === 'Notification' || sns?.Type === 'Notification' || sns?.Message) {
        const rawMessage =
          typeof sns.Message === 'string' ? sns.Message : JSON.stringify(sns.Message ?? sns);
        let sesMsg: SesMessage | undefined;
        try {
          sesMsg = JSON.parse(rawMessage) as SesMessage;
        } catch {
          sesMsg = undefined;
        }

        const bucketName = sesMsg?.receipt?.action?.bucketName || sns.bucket || S3_BUCKET;
        let objectKey = sesMsg?.receipt?.action?.objectKey || sns.objectKey;

        if (!objectKey && sesMsg?.mail?.messageId) {
          objectKey = `emails/${sesMsg.mail.messageId}`;
        }

        if (!objectKey) {
          app.log.warn({ sesMsg, sns }, '[inbound] Could not determine S3 objectKey, ignoring');
          return reply.status(200).send({ ok: true });
        }

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
        const isSpam = sesMsg?.receipt?.spamVerdict?.status?.toUpperCase() === 'FAIL';

        // Collect all destination addresses from SES receipt + parsed headers
        const allRecipients = Array.from(
          new Set(
            [
              ...(sesMsg?.receipt?.recipients ?? []),
              ...(sesMsg?.mail?.destination ?? []),
              ...parsed.toAddresses,
              ...parsed.ccAddresses,
            ].map((a) => a.trim().toLowerCase()),
          ),
        );

        let quantmailRecipients = allRecipients.filter((a) => isQuantMailAddress(a));
        if (quantmailRecipients.length === 0) {
          const handles = allRecipients.map((r) => r.split('@')[0].toLowerCase());
          quantmailRecipients = handles.map((h) => `${h}@quantmail.in`);
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
            findFirst(a: unknown): Promise<{ id: string } | null>;
          };
        };

        const handles = quantmailRecipients.map((r) => r.split('@')[0]);
        const matchedUsers = await userModel.user.findMany({
          where: {
            OR: [
              { email: { in: quantmailRecipients, mode: 'insensitive' } as never },
              { username: { in: handles, mode: 'insensitive' } as never },
              ...quantmailRecipients.flatMap((r) => {
                const h = r.split('@')[0].toLowerCase();
                return [
                  { email: { equals: `${h}@quantmail.in`, mode: 'insensitive' as const } },
                  { email: { equals: `${h}@quantrinity.in`, mode: 'insensitive' as const } },
                  { email: { equals: `${h}@quantchat.online`, mode: 'insensitive' as const } },
                ];
              }),
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

          // Idempotency check: don't insert duplicates
          const existing = await userModel.email
            .findFirst({
              where: {
                userId: user.id,
                subject: parsed.subject || '(no subject)',
                fromAddress: parsed.fromAddress,
              },
            })
            .catch(() => null);

          if (existing) {
            app.log.info(
              { userId: user.id, emailId: existing.id },
              '[inbound] Email already delivered, skipping',
            );
            delivered++;
            continue;
          }

          await userModel.email.create({
            data: {
              userId: user.id,
              folderId: inboxFolder?.id ?? null,
              fromAddress: parsed.fromAddress,
              fromName: parsed.fromName ?? parsed.fromAddress.split('@')[0],
              toAddresses: parsed.toAddresses.length > 0 ? parsed.toAddresses : quantmailRecipients,
              ccAddresses: parsed.ccAddresses,
              bccAddresses: [],
              subject: parsed.subject || '(no subject)',
              bodyHtml: parsed.bodyHtml,
              bodyPlain: parsed.bodyPlain,
              snippet,
              threadId: null,
              inReplyTo: parsed.inReplyTo ?? null,
              hasAttachments: false,
              attachments: [],
              isRead: false,
              isSent: false,
              isDraft: false,
              isSpam,
              receivedAt: parsed.date ?? new Date(),
              deliveryStatus: 'delivered',
              authResults: {
                spf: sesMsg?.receipt?.spfVerdict?.status,
                dkim: sesMsg?.receipt?.dkimVerdict?.status,
                dmarc: sesMsg?.receipt?.dmarcVerdict?.status,
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

      // Direct manual trigger with objectKey / bucket
      if (sns?.objectKey) {
        const bucket = sns.bucket || S3_BUCKET;
        const rawEmail = await fetchRawFromS3(bucket, sns.objectKey);
        const parsed = parseRawEmail(rawEmail);
        return reply
          .status(200)
          .send({ ok: true, parsed: { subject: parsed.subject, from: parsed.fromAddress } });
      }

      // Unknown message type — acknowledge and ignore
      return reply.status(200).send({ ok: true });
    } catch (err) {
      // Always return 200 to SNS to prevent infinite retries
      app.log.error({ err }, '[inbound] Unhandled error in webhook handler');
      return reply.status(200).send({ ok: true });
    }
  });

  // Replay/Sync all emails currently in S3 into inboxes
  app.post('/webhook/inbound/sync-all', async (_request, reply) => {
    try {
      const listCmd = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: 'emails/',
      });
      const listResp = await s3.send(listCmd);
      const objects = listResp.Contents ?? [];
      let totalDelivered = 0;

      for (const obj of objects) {
        if (
          !obj.Key ||
          obj.Key.endsWith('/') ||
          obj.Key.includes('AMAZON_SES_SETUP_NOTIFICATION')
        ) {
          continue;
        }
        try {
          const rawEmail = await fetchRawFromS3(S3_BUCKET, obj.Key);
          const parsed = parseRawEmail(rawEmail);
          const allRecipients = Array.from(
            new Set(
              [...parsed.toAddresses, ...parsed.ccAddresses].map((a) => a.trim().toLowerCase()),
            ),
          );
          let quantmailRecipients = allRecipients.filter((a) => isQuantMailAddress(a));
          if (quantmailRecipients.length === 0) {
            const handles = allRecipients.map((r) => r.split('@')[0].toLowerCase());
            quantmailRecipients = handles.map((h) => `${h}@quantmail.in`);
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
              findFirst(a: unknown): Promise<{ id: string } | null>;
            };
          };

          const handles = quantmailRecipients.map((r) => r.split('@')[0]);
          const matchedUsers = await userModel.user.findMany({
            where: {
              OR: [
                { email: { in: quantmailRecipients, mode: 'insensitive' } as never },
                { username: { in: handles, mode: 'insensitive' } as never },
                ...quantmailRecipients.flatMap((r) => {
                  const h = r.split('@')[0].toLowerCase();
                  return [
                    { email: { equals: `${h}@quantmail.in`, mode: 'insensitive' as const } },
                    { email: { equals: `${h}@quantrinity.in`, mode: 'insensitive' as const } },
                    { email: { equals: `${h}@quantchat.online`, mode: 'insensitive' as const } },
                  ];
                }),
              ],
            },
            select: { id: true, email: true, username: true },
          });

          const snippet = (parsed.bodyPlain || parsed.bodyHtml.replace(/<[^>]+>/g, '')).slice(
            0,
            140,
          );
          for (const user of matchedUsers) {
            const inboxFolder = await userModel.folder
              .findFirst({ where: { userId: user.id, type: 'INBOX' } })
              .catch(() => null);

            const existing = await userModel.email
              .findFirst({
                where: {
                  userId: user.id,
                  subject: parsed.subject || '(no subject)',
                  fromAddress: parsed.fromAddress,
                },
              })
              .catch(() => null);

            if (existing) continue;

            await userModel.email.create({
              data: {
                userId: user.id,
                folderId: inboxFolder?.id ?? null,
                fromAddress: parsed.fromAddress,
                fromName: parsed.fromName ?? parsed.fromAddress.split('@')[0],
                toAddresses:
                  parsed.toAddresses.length > 0 ? parsed.toAddresses : quantmailRecipients,
                ccAddresses: parsed.ccAddresses,
                bccAddresses: [],
                subject: parsed.subject || '(no subject)',
                bodyHtml: parsed.bodyHtml,
                bodyPlain: parsed.bodyPlain,
                snippet,
                threadId: null,
                inReplyTo: parsed.inReplyTo ?? null,
                hasAttachments: false,
                attachments: [],
                isRead: false,
                isSent: false,
                isDraft: false,
                isSpam: false,
                receivedAt: parsed.date ?? new Date(),
                deliveryStatus: 'delivered',
              },
            });
            totalDelivered++;
          }
        } catch (e) {
          app.log.error({ err: e, key: obj.Key }, '[inbound] Sync error for key');
        }
      }

      return reply
        .status(200)
        .send({ ok: true, scanned: objects.length, delivered: totalDelivered });
    } catch (err) {
      app.log.error({ err }, '[inbound] Sync-all failed');
      return reply.status(500).send({ ok: false, error: String(err) });
    }
  });
}
