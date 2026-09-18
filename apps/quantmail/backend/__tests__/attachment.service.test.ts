import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentService } from '../services/attachment.service';

// ---------------------------------------------------------------------------
// Fake StorageClient — structurally compatible with packages/storage.
// No mock BUFFERS of file content: bytes put in are the bytes read back.
// ---------------------------------------------------------------------------
class FakeStorage {
  objects = new Map<string, { body: Buffer; contentType: string }>();
  signedPuts: Array<{ key: string; contentLength: number; expiresIn: number }> = [];
  signedGets: Array<{ key: string; expiresIn: number }> = [];
  deleted: string[] = [];

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
        `https://acct.r2.cloudflarestorage.com/bucket/${args.key}` +
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
      `https://acct.r2.cloudflarestorage.com/bucket/${key}` +
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

// ---------------------------------------------------------------------------
// Fake mailAttachment delegate. NOT optional-chained: a missing delegate must
// throw loudly (W15-3), so the service reads db.mailAttachment directly.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function makeDb() {
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

const OWNER = 'user_owner_1';
const OTHER = 'user_other_2';
const MAX = 25 * 1024 * 1024;

describe('AttachmentService (real storage)', () => {
  let storage: FakeStorage;
  let db: ReturnType<typeof makeDb>;
  let service: AttachmentService;

  beforeEach(() => {
    storage = new FakeStorage();
    db = makeDb();
    service = new AttachmentService({
      storage: storage as never,
      db: db as never,
      bucket: 'quantmail-attachments',
      maxBytes: MAX,
    });
  });

  // -- generateUploadUrl ----------------------------------------------------

  it('returns a genuinely signed PUT URL and persists a PENDING row', async () => {
    const result = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 2048,
    });

    expect(result.uploadUrl).toContain('X-Amz-Signature=');
    expect(result.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    // content-length must be signed — that is the ONLY size enforcement a
    // presigned PUT can carry (R2 has no presigned POST / content-length-range).
    expect(result.uploadUrl).toContain('content-length');
    expect(result.attachmentId).toMatch(/^att_/);
    expect(result.key).toBe(`attachments/${OWNER}/${result.attachmentId}/report.pdf`);

    const row = db.rows.get(result.attachmentId)!;
    expect(row.status).toBe('PENDING');
    expect(row.userId).toBe(OWNER);
    expect(row.declaredSize).toBe(2048);
    expect(storage.signedPuts[0]).toMatchObject({ contentLength: 2048 });
  });

  it('rejects declared sizes over 25MB with 413 ATTACHMENT_TOO_LARGE', async () => {
    await expect(
      service.generateUploadUrl({
        userId: OWNER,
        filename: 'huge.zip',
        contentType: 'application/zip',
        size: MAX + 1,
      }),
    ).rejects.toMatchObject({ statusCode: 413, code: 'ATTACHMENT_TOO_LARGE' });
    expect(db.mailAttachment.create).not.toHaveBeenCalled();
    expect(storage.signedPuts).toHaveLength(0);
  });

  it('sanitizes traversal filenames before they reach the object key', async () => {
    const result = await service.generateUploadUrl({
      userId: OWNER,
      filename: '../../etc/passwd',
      contentType: 'text/plain',
      size: 10,
    });
    expect(result.key).not.toContain('..');
    expect(result.key.split('/')).toHaveLength(4);
  });

  // -- finalizeUpload / HeadObject validation -------------------------------

  it('finalizeUpload verifies real bytes via HeadObject and marks READY', async () => {
    const body = Buffer.from('a real pdf-ish payload');
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: body.byteLength,
    });

    storage.put(key, body, 'application/pdf');

    const meta = await service.finalizeUpload({ userId: OWNER, attachmentId });
    expect(meta.size).toBe(body.byteLength);
    expect(meta.status).toBe('READY');
    expect(db.rows.get(attachmentId)!.status).toBe('READY');
  });

  it('finalizeUpload deletes the object and 413s when real size exceeds the cap', async () => {
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'sneaky.bin',
      contentType: 'application/octet-stream',
      size: 1024,
    });

    // A signature-mismatching upload should never land, but if the bucket is
    // ever written by another path, finalize is the backstop.
    storage.put(key, Buffer.alloc(MAX + 1), 'application/octet-stream');

    await expect(service.finalizeUpload({ userId: OWNER, attachmentId })).rejects.toMatchObject({
      statusCode: 413,
      code: 'ATTACHMENT_TOO_LARGE',
    });

    expect(storage.deleted).toContain(key);
    expect(storage.objects.has(key)).toBe(false);
    expect(db.rows.get(attachmentId)!.status).toBe('REJECTED');
  });

  it('finalizeUpload 409s UPLOAD_INCOMPLETE when nothing was uploaded', async () => {
    const { attachmentId } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'never.pdf',
      contentType: 'application/pdf',
      size: 10,
    });

    await expect(service.finalizeUpload({ userId: OWNER, attachmentId })).rejects.toMatchObject({
      statusCode: 409,
      code: 'UPLOAD_INCOMPLETE',
    });
    expect(db.rows.get(attachmentId)!.status).toBe('PENDING');
  });

  // -- reads ----------------------------------------------------------------

  it('readAttachment returns the exact uploaded bytes (no mock buffer)', async () => {
    const body = Buffer.from('QuantMail real attachment bytes \u00e9\u00e8');
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'note.txt',
      contentType: 'text/plain',
      size: body.byteLength,
    });
    storage.put(key, body, 'text/plain');
    await service.finalizeUpload({ userId: OWNER, attachmentId });

    const { body: read, metadata } = await service.readAttachment(attachmentId, OWNER);
    expect(read.equals(body)).toBe(true);
    expect(read.toString()).not.toContain('Mock attachment content');
    expect(metadata.size).toBe(body.byteLength);
  });

  it('readAttachment 409s on a PENDING row instead of inventing content', async () => {
    const { attachmentId } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'pending.pdf',
      contentType: 'application/pdf',
      size: 10,
    });
    await expect(service.readAttachment(attachmentId, OWNER)).rejects.toMatchObject({
      statusCode: 409,
      code: 'UPLOAD_INCOMPLETE',
    });
  });

  it('getDownloadUrl returns a signed GET with a short TTL', async () => {
    const body = Buffer.from('payload');
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'big.bin',
      contentType: 'application/octet-stream',
      size: body.byteLength,
    });
    storage.put(key, body, 'application/octet-stream');
    await service.finalizeUpload({ userId: OWNER, attachmentId });

    const { url, expiresAt, size } = await service.getDownloadUrl(attachmentId, OWNER, 120);
    expect(url).toContain('X-Amz-Signature=');
    expect(storage.signedGets[0]).toEqual({ key, expiresIn: 120 });
    expect(size).toBe(body.byteLength);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // -- tenancy --------------------------------------------------------------

  it('hides another user\u2019s attachment as 404, not 403', async () => {
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'private.pdf',
      contentType: 'application/pdf',
      size: 4,
    });
    storage.put(key, Buffer.from('abcd'), 'application/pdf');
    await service.finalizeUpload({ userId: OWNER, attachmentId });

    await expect(service.getAttachment(attachmentId, OTHER)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ATTACHMENT_NOT_FOUND',
    });
    await expect(service.getDownloadUrl(attachmentId, OTHER, 120)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(storage.signedGets).toHaveLength(0);
  });

  it('unknown ids 404 instead of returning a hardcoded document.pdf', async () => {
    await expect(service.getAttachment('att_does_not_exist', OWNER)).rejects.toMatchObject({
      statusCode: 404,
      code: 'ATTACHMENT_NOT_FOUND',
    });
  });

  // -- delete ---------------------------------------------------------------

  it('deleteAttachment removes the object and the row', async () => {
    const { attachmentId, key } = await service.generateUploadUrl({
      userId: OWNER,
      filename: 'gone.pdf',
      contentType: 'application/pdf',
      size: 3,
    });
    storage.put(key, Buffer.from('abc'), 'application/pdf');
    await service.finalizeUpload({ userId: OWNER, attachmentId });

    await expect(service.deleteAttachment(attachmentId, OWNER)).resolves.toEqual({ deleted: true });
    expect(storage.deleted).toContain(key);
    expect(db.rows.has(attachmentId)).toBe(false);
  });

  // -- fail-loud wiring (W15-3) --------------------------------------------

  it('throws loudly when the mailAttachment delegate is missing', async () => {
    const broken = new AttachmentService({
      storage: storage as never,
      db: {} as never,
    });
    await expect(
      broken.generateUploadUrl({
        userId: OWNER,
        filename: 'x.pdf',
        contentType: 'application/pdf',
        size: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
