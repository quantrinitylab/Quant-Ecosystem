import { Readable } from 'node:stream';
import { vi } from 'vitest';

export class FakeStorage {
  bucket: string;
  objects = new Map<string, { body: Buffer; contentType: string }>();
  signedPuts: Array<{ key: string; contentLength: number; expiresIn: number }> = [];
  signedGets: Array<{ key: string; expiresIn: number }> = [];
  deleted: string[] = [];

  constructor(bucket = 'quantmail-attachments') {
    this.bucket = bucket;
  }

  async getSignedUploadUrl(args: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<any> {
    this.signedPuts.push({
      key: args.key,
      contentLength: args.contentLength,
      expiresIn: args.expiresIn ?? 0,
    });
    return {
      url:
        `https://acct.r2.cloudflarestorage.com/${this.bucket}/${args.key}` +
        `?X-Amz-Algorithm=AWS4-HMAC-SHA256` +
        `&X-Amz-Expires=${args.expiresIn ?? 900}` +
        `&X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost` +
        `&X-Amz-Signature=deadbeef`,
      key: args.key,
      method: 'PUT',
      expiresAt: new Date(Date.now() + (args.expiresIn ?? 900) * 1000),
      requiredHeaders: {
        'Content-Type': args.contentType,
        'Content-Length': String(args.contentLength),
      },
      maxBytes: 25 * 1024 * 1024,
    };
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    this.signedGets.push({ key, expiresIn });
    return (
      `https://acct.r2.cloudflarestorage.com/${this.bucket}/${key}` +
      `?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}` +
      `&X-Amz-Signature=cafebabe`
    );
  }

  async headObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) {
      const err = new Error('NotFound') as Error & { name: string };
      err.name = 'NotFound';
      throw err;
    }
    return {
      contentType: obj.contentType,
      contentLength: obj.body.byteLength,
      lastModified: new Date('2026-09-18T00:00:00Z'),
      metadata: {},
    };
  }

  async getObjectSize(key: string): Promise<number | null> {
    const obj = this.objects.get(key);
    return obj ? obj.body.byteLength : null;
  }

  async download(key: string) {
    const obj = this.objects.get(key);
    if (!obj) {
      const err = new Error('NotFound') as Error & { name: string };
      err.name = 'NotFound';
      throw err;
    }
    return {
      body: Readable.from([obj.body]),
      contentType: obj.contentType,
      contentLength: obj.body.byteLength,
    };
  }

  async delete(key: string) {
    this.deleted.push(key);
    this.objects.delete(key);
  }

  /** Simulates the browser's PUT to the presigned URL. */
  put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
}

export type Row = Record<string, unknown>;

export function makeDb() {
  const rows = new Map<string, Row>();
  return {
    rows,
    mailAttachment: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        rows.set(data.id as string, { ...data });
        return rows.get(data.id as string)!;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return rows.get(where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const existing = rows.get(where.id);
        if (!existing) throw new Error('P2025');
        const next = { ...existing, ...data };
        rows.set(where.id, next);
        return next;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const existing = rows.get(where.id);
        if (!existing) throw new Error('P2025');
        rows.delete(where.id);
        return existing;
      }),
    },
  };
}
