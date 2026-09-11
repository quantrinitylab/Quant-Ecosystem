// ============================================================================
// QuantMail — Drive object storage + envelope encryption
//
// Drive rows keep metadata plus envelope-encryption material. Ciphertext lives
// in S3-compatible object storage; encryptedContent stores the object key.
// ============================================================================
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { byteEnv } from '../lib/env-bytes';

const MIB = 1024 * 1024;

export const DRIVE_QUOTA_BYTES = byteEnv('DRIVE_QUOTA_BYTES', 15 * 1024 * MIB);
export const DRIVE_MAX_FILE_BYTES = byteEnv('DRIVE_MAX_FILE_BYTES', 25 * MIB);
export const DRIVE_MAX_BODY_BYTES = Math.ceil(DRIVE_MAX_FILE_BYTES * 1.4) + 64 * 1024;

type S3Config = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function readMasterKey(): Buffer | null {
  const raw = process.env.DRIVE_MASTER_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

function readS3Config(): S3Config | null {
  const bucket = process.env.DRIVE_S3_BUCKET ?? process.env.S3_BUCKET;
  const accessKeyId = process.env.DRIVE_S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DRIVE_S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  const region = process.env.DRIVE_S3_REGION ?? process.env.S3_REGION ?? 'us-east-1';
  const endpoint = (
    process.env.DRIVE_S3_ENDPOINT ??
    process.env.S3_ENDPOINT ??
    `https://s3.${region}.amazonaws.com`
  ).replace(/\/+$/, '');
  const forcePathStyle =
    (process.env.DRIVE_S3_FORCE_PATH_STYLE ?? process.env.S3_FORCE_PATH_STYLE ?? 'false') ===
    'true';
  return { bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle };
}

export function driveStorageReady(): boolean {
  return readS3Config() !== null && readMasterKey() !== null;
}
export function driveStorageUnavailableReason(): string {
  if (!readS3Config()) return 'Drive object storage is not configured (DRIVE_S3_* missing)';
  if (!readMasterKey()) return 'Drive encryption key is not configured (DRIVE_MASTER_KEY missing)';
  return '';
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function s3Request(
  method: 'PUT' | 'GET' | 'DELETE',
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const config = readS3Config();
  if (!config) throw new Error('Drive object storage is not configured');
  const base = new URL(config.endpoint);
  const host = config.forcePathStyle ? base.host : `${config.bucket}.${base.host}`;
  const path = config.forcePathStyle ? `/${config.bucket}/${encodeKey(key)}` : `/${encodeKey(key)}`;
  const url = `${base.protocol}//${host}${path}`;
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '')}`;
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method === 'PUT' && payload ? (new Uint8Array(payload) as unknown as BodyInit) : undefined,
  });
}

export async function putDriveObject(key: string, body: Buffer): Promise<void> {
  const res = await s3Request('PUT', key, body, 'application/octet-stream');
  if (!res.ok) throw new Error(`S3 PUT failed (${res.status}): ${await res.text()}`);
}
export async function getDriveObject(key: string): Promise<Buffer> {
  const res = await s3Request('GET', key);
  if (!res.ok) throw new Error(`S3 GET failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
export async function deleteDriveObject(key: string): Promise<void> {
  const res = await s3Request('DELETE', key);
  if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE failed (${res.status})`);
}

export type Envelope = {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
  wrappedKey: string;
  contentHash: string;
};

export function encryptForDrive(plaintext: Buffer): Envelope {
  const master = readMasterKey();
  if (!master) throw new Error('DRIVE_MASTER_KEY missing');
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const keyIv = randomBytes(12);
  const keyCipher = createCipheriv('aes-256-gcm', master, keyIv);
  const wrapped = Buffer.concat([keyCipher.update(dataKey), keyCipher.final()]);
  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    wrappedKey: [
      keyIv.toString('base64'),
      wrapped.toString('base64'),
      keyCipher.getAuthTag().toString('base64'),
    ].join('.'),
    contentHash: createHash('sha256').update(plaintext).digest('hex'),
  };
}

export function decryptFromDrive(
  ciphertext: Buffer,
  iv: string,
  authTag: string,
  wrappedKey: string,
): Buffer {
  const master = readMasterKey();
  if (!master) throw new Error('DRIVE_MASTER_KEY missing');
  const [keyIv, wrapped, keyTag] = wrappedKey.split('.');
  if (!keyIv || !wrapped || !keyTag) throw new Error('Corrupt key envelope');
  const keyDecipher = createDecipheriv('aes-256-gcm', master, Buffer.from(keyIv, 'base64'));
  keyDecipher.setAuthTag(Buffer.from(keyTag, 'base64'));
  const dataKey = Buffer.concat([
    keyDecipher.update(Buffer.from(wrapped, 'base64')),
    keyDecipher.final(),
  ]);
  const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function hashFromVersionKey(key: string): string | null {
  return key.match(/-([a-f0-9]{64})$/i)?.[1]?.toLowerCase() ?? null;
}

export async function checkedPlaintext(row: {
  encryptedContent: string;
  encryptionIV: string;
  encryptionAuthTag: string;
  encryptionKey: string;
  contentHash?: string;
}): Promise<Buffer> {
  const ciphertext = await getDriveObject(row.encryptedContent);
  const plaintext = decryptFromDrive(
    ciphertext,
    row.encryptionIV,
    row.encryptionAuthTag,
    row.encryptionKey,
  );
  const expected = hashFromVersionKey(row.encryptedContent) ?? row.contentHash;
  const actual = createHash('sha256').update(plaintext).digest('hex');
  if (expected && actual !== expected.toLowerCase()) {
    throw createAppError('Stored object failed integrity validation', 409, 'INTEGRITY_ERROR');
  }
  return plaintext;
}

export function driveObjectKey(userId: string, fileId: string): string {
  return `drive/${userId}/${fileId}`;
}
export function safeFileName(name: string): string {
  return name.replace(/[\r\n"\\/]/g, '').slice(0, 255) || 'untitled';
}
