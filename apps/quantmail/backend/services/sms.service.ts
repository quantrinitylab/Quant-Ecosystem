// ============================================================================
// QuantMail — AWS SNS SMS sender (real OTP delivery).
//
// Signs a SigV4 request to the SNS Publish API and sends a transactional SMS.
// Config (from EKS secrets / env):
//   SNS_REGION | AWS_REGION            e.g. ap-south-1
//   SNS_ACCESS_KEY_ID | AWS_ACCESS_KEY_ID
//   SNS_SECRET_ACCESS_KEY | AWS_SECRET_ACCESS_KEY
//   SNS_SENDER_ID (optional)           e.g. QUANTML
// ============================================================================
import { createHash, createHmac } from 'crypto';

interface SnsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  senderId?: string;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readConfig(): SnsConfig | null {
  const region = env('SNS_REGION') ?? env('AWS_REGION');
  const accessKeyId = env('SNS_ACCESS_KEY_ID') ?? env('AWS_ACCESS_KEY_ID');
  const secretAccessKey = env('SNS_SECRET_ACCESS_KEY') ?? env('AWS_SECRET_ACCESS_KEY');
  if (!region || !accessKeyId || !secretAccessKey) return null;
  const senderId = env('SNS_SENDER_ID');
  return senderId
    ? { region, accessKeyId, secretAccessKey, senderId }
    : { region, accessKeyId, secretAccessKey };
}

export function smsReady(): boolean {
  return readConfig() !== null;
}

export function smsUnavailableReason(): string {
  return 'SMS delivery is not configured on this environment';
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Publish an SMS message via SNS. Throws on any non-2xx response. */
export async function sendSms(phoneNumber: string, message: string): Promise<void> {
  const config = readConfig();
  if (!config) throw new Error(smsUnavailableReason());

  const host = `sns.${config.region}.amazonaws.com`;
  const params = new URLSearchParams({
    Action: 'Publish',
    Version: '2010-03-31',
    PhoneNumber: phoneNumber,
    Message: message,
    'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SMSType',
    'MessageAttributes.entry.1.Value.DataType': 'String',
    'MessageAttributes.entry.1.Value.StringValue': 'Transactional',
  });
  if (config.senderId) {
    params.set('MessageAttributes.entry.2.Name', 'AWS.SNS.SMS.SenderID');
    params.set('MessageAttributes.entry.2.Value.DataType', 'String');
    params.set('MessageAttributes.entry.2.Value.StringValue', config.senderId);
  }

  const body = params.toString();
  const payloadHash = sha256Hex(body);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
    host,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );

  const scope = `${dateStamp}/${config.region}/sns/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), 'sns'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const response = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SNS Publish failed (${response.status}): ${text.slice(0, 400)}`);
  }
}
