// ============================================================================
// QuantMail — SES direct email sender (fallback for when the BullMQ outbound
// worker isn't reachable, e.g. sandbox/dev or Redis not provisioned for queues).
// Uses @aws-sdk/client-sesv2 SendEmail API. Credentials from env:
//   SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY / SES_REGION (defaults to the
//   global AWS creds if these are unset).
// ============================================================================

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

let client: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (!client) {
    const region = process.env['SES_REGION'] ?? process.env['AWS_REGION'] ?? 'us-east-1';
    const accessKeyId = process.env['SES_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['SES_SECRET_ACCESS_KEY'];

    if (accessKeyId && secretAccessKey) {
      client = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
    } else {
      // Falls back to default AWS credential chain (e.g. IRSA on EKS)
      client = new SESv2Client({ region });
    }
  }
  return client;
}

export interface SesSendOptions {
  from: string; // e.g. "User Name <user@quantmail.in>"
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
}

/**
 * Send an email via SES directly. Returns the SES MessageId on success,
 * or throws on failure (caller should catch and degrade gracefully).
 */
export async function sendViaSes(opts: SesSendOptions): Promise<string> {
  const ses = getClient();
  const command = new SendEmailCommand({
    FromEmailAddress: opts.from,
    Destination: {
      ToAddresses: opts.to,
      CcAddresses: opts.cc ?? [],
      BccAddresses: opts.bcc ?? [],
    },
    ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: {
          ...(opts.bodyHtml
            ? { Html: { Data: opts.bodyHtml, Charset: 'UTF-8' } }
            : {}),
          ...(opts.bodyText
            ? { Text: { Data: opts.bodyText, Charset: 'UTF-8' } }
            : {}),
        },
      },
    },
  });
  const response = await ses.send(command);
  return response.MessageId ?? 'unknown';
}

/**
 * Check if the SES sender is actually configured with usable credentials.
 *
 * A bare region is NOT a credential: a deployment that only sets `AWS_REGION`
 * (common — it is injected into most AWS runtimes by default) must fall back to
 * the SMTP transport rather than route mail to SES and fail at transmit. We
 * therefore gate on the two credential paths `getClient()` can actually use:
 *   1. Explicit static SES credentials (`SES_ACCESS_KEY_ID` + `SES_SECRET_ACCESS_KEY`).
 *   2. Ambient credentials resolvable by the AWS SDK default provider chain that
 *      `getClient()` falls back to — IRSA on EKS (`AWS_WEB_IDENTITY_TOKEN_FILE`
 *      + `AWS_ROLE_ARN`), an ECS task role (`AWS_CONTAINER_CREDENTIALS_*`), or a
 *      shared `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` pair.
 */
export function isSesConfigured(): boolean {
  const hasStaticSesCredentials = Boolean(
    process.env['SES_ACCESS_KEY_ID'] && process.env['SES_SECRET_ACCESS_KEY'],
  );
  const hasAmbientAwsCredentials = Boolean(
    (process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY']) ||
      (process.env['AWS_WEB_IDENTITY_TOKEN_FILE'] && process.env['AWS_ROLE_ARN']) ||
      process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] ||
      process.env['AWS_CONTAINER_CREDENTIALS_FULL_URI'],
  );
  return hasStaticSesCredentials || hasAmbientAwsCredentials;
}
