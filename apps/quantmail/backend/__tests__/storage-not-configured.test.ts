// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { resolveStorageConfigFromEnv } from '@quant/storage';
import {
  AttachmentService,
  attachmentStorageReady,
  attachmentStorageUnavailableReason,
} from '../services/attachment.service';
import {
  parseRedisPort,
  resolveRedisConnection,
  DEFAULT_REDIS_PORT,
} from '../services/outbound-delivery.service';
import attachmentRoutes from '../routes/attachments';
import { makeDb } from './helpers/attachment-doubles';

/**
 * Bug 1 regression: the backend must boot WITHOUT R2/S3 env vars.
 * Object storage is optional — missing config warns once at startup (no crash)
 * and every storage operation fails with a clear 503 STORAGE_NOT_CONFIGURED.
 */

const STORAGE_ENV_KEYS = [
  'CLOUDFLARE_R2_ENDPOINT',
  'R2_ENDPOINT',
  'S3_ENDPOINT',
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'S3_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'S3_SECRET_KEY',
  'AWS_SECRET_ACCESS_KEY',
];

const savedEnv: Record<string, string | undefined> = {};
let savedNodeEnv: string | undefined;

function stripStorageEnv() {
  savedNodeEnv = process.env.NODE_ENV;
  for (const key of STORAGE_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Production is the path that used to throw (and crash backend startup).
  process.env.NODE_ENV = 'production';
}

function restoreEnv() {
  for (const key of STORAGE_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
}

describe('storage-not-configured (Bug 1)', () => {
  beforeEach(() => {
    stripStorageEnv();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('resolveStorageConfigFromEnv returns null (does not throw) when env is missing in production', () => {
    expect(() => resolveStorageConfigFromEnv()).not.toThrow();
    expect(resolveStorageConfigFromEnv()).toBeNull();
  });

  it('resolveStorageConfigFromEnv still resolves a config when env IS present', () => {
    const config = resolveStorageConfigFromEnv({
      NODE_ENV: 'production',
      S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      S3_ACCESS_KEY: 'test-key',
      S3_SECRET_KEY: 'test-secret',
      S3_BUCKET: 'test-bucket',
    } as NodeJS.ProcessEnv);
    expect(config).not.toBeNull();
    expect(config!.bucket).toBe('test-bucket');
    expect(config!.provider).toBe('s3');
  });

  it('AttachmentService constructs without storage env — no startup crash', () => {
    const db = makeDb();
    let service: AttachmentService | undefined;
    expect(() => {
      service = new AttachmentService({ db: db as never });
    }).not.toThrow();
    expect(service).toBeDefined();
    expect(attachmentStorageReady()).toBe(false);
    expect(attachmentStorageUnavailableReason()).toContain('Object storage is not configured');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('object storage not configured'),
    );
  });

  it('generateUploadUrl fails with 503 STORAGE_NOT_CONFIGURED and a clear message', async () => {
    const db = makeDb();
    const service = new AttachmentService({ db: db as never });
    const attempt = () =>
      service.generateUploadUrl({
        userId: 'user-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 2048,
      });
    await expect(attempt()).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORAGE_NOT_CONFIGURED',
    });
    await expect(attempt()).rejects.toThrow('Object storage is not configured');
  });

  it('storage operations fail with 503 STORAGE_NOT_CONFIGURED when storage is missing', async () => {
    const db = makeDb();
    // Seed a READY row so the failure comes from the storage guard, not the DB.
    db.rows.set('att_1', {
      id: 'att_1',
      userId: 'user-1',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      declaredSize: 2048,
      storedSize: 2048,
      storageKey: 'attachments/user-1/att_1/report.pdf',
      status: 'READY',
      createdAt: new Date(),
      uploadedAt: new Date(),
    });
    const service = new AttachmentService({ db: db as never });
    const expected = { statusCode: 503, code: 'STORAGE_NOT_CONFIGURED' };
    await expect(service.readAttachment('att_1', 'user-1')).rejects.toMatchObject(expected);
    await expect(service.getDownloadUrl('att_1', 'user-1')).rejects.toMatchObject(expected);
    await expect(service.deleteAttachment('att_1', 'user-1')).rejects.toMatchObject(expected);
    await expect(service.finalizeUpload('att_1', 'user-1')).rejects.toMatchObject(expected);
  });

  it('POST /attachments/upload-url returns 503 STORAGE_NOT_CONFIGURED', async () => {
    const db = makeDb();
    const service = new AttachmentService({ db: db as never });
    const app: FastifyInstance = Fastify();
    await app.register(errorHandlerPlugin);
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId: 'user-1' };
    });
    await app.register(attachmentRoutes, { prefix: '/attachments', service });

    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-url',
      payload: { filename: 'report.pdf', contentType: 'application/pdf', size: 2048 },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('STORAGE_NOT_CONFIGURED');
    expect(res.json().error.message).toContain('Object storage is not configured');
    await app.close();
  });
});

describe('parseRedisPort (Bug 2 follow-up: REDIS_PORT NaN guard)', () => {
  const REDIS_PORT = 'REDIS_PORT';
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[REDIS_PORT];
    delete process.env[REDIS_PORT];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (saved === undefined) delete process.env[REDIS_PORT];
    else process.env[REDIS_PORT] = saved;
  });

  it('returns 6379 when REDIS_PORT is unset or empty', () => {
    expect(parseRedisPort()).toBe(6379);
    expect(parseRedisPort('')).toBe(6379);
    expect(parseRedisPort(undefined)).toBe(DEFAULT_REDIS_PORT);
  });

  it('parses a valid REDIS_PORT unchanged', () => {
    expect(parseRedisPort('6381')).toBe(6381);
    expect(parseRedisPort('6379')).toBe(6379);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to 6379 with a warning on invalid REDIS_PORT — never NaN', () => {
    expect(parseRedisPort('abc')).toBe(6379);
    expect(parseRedisPort('99999')).toBe(6379);
    expect(parseRedisPort('12.5')).toBe(6379);
    for (const v of ['abc', '99999', '12.5']) {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Invalid REDIS_PORT="${v}"`),
      );
    }
  });

  it('resolveRedisConnection uses 6379 for invalid REDIS_PORT', () => {
    const opts = resolveRedisConnection({ REDIS_HOST: 'redis.service', REDIS_PORT: 'bogus' });
    expect(opts.port).toBe(6379);
    expect(opts.host).toBe('redis.service');
  });

  it('resolveRedisConnection keeps a valid explicit REDIS_PORT', () => {
    const opts = resolveRedisConnection({ REDIS_HOST: 'redis.service', REDIS_PORT: '6381' });
    expect(opts.port).toBe(6381);
  });
});
