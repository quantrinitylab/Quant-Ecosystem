// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decryptFromDrive,
  deleteDriveObject,
  driveObjectKey,
  driveStorageReady,
  driveStorageUnavailableReason,
  encryptForDrive,
  getDriveObject,
  putDriveObject,
} from '../services/drive-storage.service';

// Isolate from the workspace @quant/* tree: drive-storage.service only needs
// createAppError from @quant/server-core (used by checkedPlaintext), and the
// worktree's packages have no built dists here. The mock is honest —
// createAppError's shape matches the real contract (Error + statusCode/code).
vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, status: number, code: string) =>
    Object.assign(new Error(message), { statusCode: status, code }),
}));

/**
 * WR-C — Drive R2 config gap.
 *
 * The shared @quant/storage resolver (used by mail attachments and chunked
 * uploads - see packages/storage/src/storage-config.ts) accepts R2-prefixed
 * and CLOUDFLARE_R2-prefixed env vars, but drive-storage.service.ts's
 * readS3Config silently ignored them:
 * an operator who configured only R2 vars got "Drive object storage is not
 * configured". These tests pin the reconciliation:
 *   - R2-prefixed / CLOUDFLARE_R2-prefixed / account-id-derived endpoints are
 *     accepted and sign SigV4 with the R2-required region "auto" (same as the
 *     shared resolver)
 *   - shared-storage S3_ACCESS_KEY / S3_SECRET_KEY names work here too
 *   - DRIVE_S3_* overrides keep winning (back-compat)
 *   - a real PUT -> GET roundtrip through the SigV4 code returns byte-identical
 *     bytes against an in-memory S3 store (upload->download byte compare)
 *   - tenant isolation: user B cannot read user A's object (cross-user deny)
 *
 * No network is touched: the in-memory stub replaces global fetch, but the
 * SigV4 signing, URL building, and key namespacing under test are the real code.
 */

const ENV_KEYS = [
  'DRIVE_S3_BUCKET',
  'DRIVE_S3_REGION',
  'DRIVE_S3_ENDPOINT',
  'DRIVE_S3_ACCESS_KEY_ID',
  'DRIVE_S3_SECRET_ACCESS_KEY',
  'DRIVE_S3_FORCE_PATH_STYLE',
  'DRIVE_R2_BUCKET',
  'DRIVE_R2_ENDPOINT',
  'DRIVE_R2_ACCESS_KEY_ID',
  'DRIVE_R2_SECRET_ACCESS_KEY',
  'DRIVE_MASTER_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ENDPOINT',
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_FORCE_PATH_STYLE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
];

const savedEnv: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function authHeader(call = 0): string {
  const init = fetchMock.mock.calls[call]?.[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers?.['Authorization'] ?? '';
}

function requestUrl(call = 0): string {
  return String(fetchMock.mock.calls[call]?.[0] ?? '');
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const MASTER_KEY = 'a'.repeat(64);

describe('drive storage — R2 config reconciliation (WR-C)', () => {
  const R2_VARS = {
    R2_ENDPOINT: 'https://myacct.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'r2-key',
    R2_SECRET_ACCESS_KEY: 'r2-secret',
    R2_BUCKET: 'drive-bucket',
  };

  it('accepts R2_* vars alone (previously ignored -> not configured)', async () => {
    setEnv({ ...R2_VARS, DRIVE_MASTER_KEY: MASTER_KEY });
    expect(driveStorageReady()).toBe(true);
    expect(driveStorageUnavailableReason()).toBe('');
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    // path-style against the R2 endpoint
    expect(requestUrl()).toBe('https://myacct.r2.cloudflarestorage.com/drive-bucket/drive/u1/f1');
    // R2 is single-region: SigV4 must use the literal region "auto",
    // exactly like the shared @quant/storage resolver forces.
    expect(authHeader()).toMatch(/^AWS4-HMAC-SHA256 Credential=r2-key\/\d{8}\/auto\/s3\/aws4_request/);
  });

  it('derives the R2 endpoint from CLOUDFLARE_R2_ACCOUNT_ID alone', async () => {
    setEnv({
      CLOUDFLARE_R2_ACCOUNT_ID: 'derivedacct',
      R2_ACCESS_KEY_ID: 'r2-key',
      R2_SECRET_ACCESS_KEY: 'r2-secret',
      R2_BUCKET: 'drive-bucket',
      DRIVE_MASTER_KEY: MASTER_KEY,
    });
    expect(driveStorageReady()).toBe(true);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe('https://derivedacct.r2.cloudflarestorage.com/drive-bucket/drive/u1/f1');
    expect(authHeader()).toMatch(/Credential=r2-key\/\d{8}\/auto\/s3\/aws4_request/);
  });

  it('accepts CLOUDFLARE_R2_ENDPOINT with the shared key names', async () => {
    setEnv({
      CLOUDFLARE_R2_ENDPOINT: 'https://other.r2.cloudflarestorage.com',
      S3_ACCESS_KEY: 'shared-key',
      S3_SECRET_KEY: 'shared-secret',
      S3_BUCKET: 'drive-bucket',
      DRIVE_MASTER_KEY: MASTER_KEY,
    });
    expect(driveStorageReady()).toBe(true);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe('https://other.r2.cloudflarestorage.com/drive-bucket/drive/u1/f1');
    expect(authHeader()).toMatch(/Credential=shared-key\/\d{8}\/auto\/s3\/aws4_request/);
  });

  it('accepts the shared-storage S3_ACCESS_KEY / S3_SECRET_KEY names on a plain S3 endpoint', async () => {
    setEnv({
      S3_ENDPOINT: 'https://s3-compat.example.com',
      S3_ACCESS_KEY: 'shared-key',
      S3_SECRET_KEY: 'shared-secret',
      S3_BUCKET: 'drive-bucket',
      S3_REGION: 'eu-west-1',
      DRIVE_MASTER_KEY: MASTER_KEY,
    });
    expect(driveStorageReady()).toBe(true);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    // non-R2 endpoint: region chain preserved (no forced "auto")
    expect(authHeader()).toMatch(/Credential=shared-key\/\d{8}\/eu-west-1\/s3\/aws4_request/);
  });

  it('DRIVE_S3_* still takes precedence over R2_* (back-compat)', async () => {
    setEnv({
      ...R2_VARS,
      DRIVE_S3_BUCKET: 'drive-alias-bucket',
      DRIVE_S3_ENDPOINT: 'https://custom.example.com',
      DRIVE_S3_ACCESS_KEY_ID: 'drive-key',
      DRIVE_S3_SECRET_ACCESS_KEY: 'drive-secret',
      DRIVE_MASTER_KEY: MASTER_KEY,
    });
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe('https://custom.example.com/drive-alias-bucket/drive/u1/f1');
    expect(authHeader()).toContain('Credential=drive-key/');
  });

  it('DRIVE_R2_* aliases work as drive-scoped R2 overrides', async () => {
    setEnv({
      DRIVE_R2_ENDPOINT: 'https://drv.r2.cloudflarestorage.com',
      DRIVE_R2_ACCESS_KEY_ID: 'drive-r2-key',
      DRIVE_R2_SECRET_ACCESS_KEY: 'drive-r2-secret',
      DRIVE_R2_BUCKET: 'drive-r2-bucket',
      DRIVE_MASTER_KEY: MASTER_KEY,
    });
    expect(driveStorageReady()).toBe(true);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe('https://drv.r2.cloudflarestorage.com/drive-r2-bucket/drive/u1/f1');
    expect(authHeader()).toMatch(/Credential=drive-r2-key\/\d{8}\/auto\/s3\/aws4_request/);
  });
});

/**
 * In-memory S3 store behind the fetch stub: stores the exact bytes PUT,
 * returns them on GET, 404s unknown keys. The SigV4 signing, path-style
 * URL building, and key namespacing are all the real production code.
 */
function useInMemoryS3() {
  const store = new Map<string, Buffer>();
  fetchMock.mockImplementation(async (url: unknown, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? 'GET';
    const pathname = new URL(String(url)).pathname;
    if (method === 'PUT') {
      const body = init?.body as Uint8Array | undefined;
      store.set(pathname, Buffer.from(body ?? new Uint8Array()));
      return new Response('ok', { status: 200 });
    }
    if (method === 'DELETE') {
      if (!store.has(pathname)) return new Response('nope', { status: 404 });
      store.delete(pathname);
      return new Response('ok', { status: 200 });
    }
    const bytes = store.get(pathname);
    if (!bytes) return new Response('nope', { status: 404 });
    return new Response(new Uint8Array(bytes), { status: 200 });
  });
  return store;
}

const STORE_VARS = {
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_BUCKET: 'drive-bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  DRIVE_MASTER_KEY: MASTER_KEY,
};

describe('drive storage — byte roundtrip + cross-user deny over real SigV4 code', () => {
  beforeEach(() => {
    setEnv(STORE_VARS);
    useInMemoryS3();
  });

  it('upload -> download returns byte-identical bytes', async () => {
    const plaintext = Buffer.from('quarterly report payload \u0000\u00ff binary tail');
    await putDriveObject(driveObjectKey('userA', 'file1'), plaintext);
    const roundtripped = await getDriveObject(driveObjectKey('userA', 'file1'));
    expect(roundtripped.equals(plaintext)).toBe(true);
  });

  it('encrypt -> upload -> download -> decrypt roundtrips the original bytes', async () => {
    const plaintext = Buffer.from('confidential drive bytes');
    const env = encryptForDrive(plaintext);
    await putDriveObject(driveObjectKey('userA', 'file1'), env.ciphertext);
    const stored = await getDriveObject(driveObjectKey('userA', 'file1'));
    const recovered = decryptFromDrive(stored, env.iv, env.authTag, env.wrappedKey);
    expect(recovered.equals(plaintext)).toBe(true);
    expect(env.contentHash).toHaveLength(64);
  });

  it('cross-user deny: user B cannot read user A object key', async () => {
    await putDriveObject(driveObjectKey('userA', 'file1'), Buffer.from('userA secret'));
    await expect(getDriveObject(driveObjectKey('userB', 'file1'))).rejects.toThrow(
      'S3 GET failed (404)',
    );
  });

  it('no cross-file leakage: same-user keys return their own bytes only', async () => {
    await putDriveObject(driveObjectKey('userA', 'file1'), Buffer.from('file one'));
    await putDriveObject(driveObjectKey('userA', 'file2'), Buffer.from('file two'));
    expect((await getDriveObject(driveObjectKey('userA', 'file1'))).toString()).toBe('file one');
    expect((await getDriveObject(driveObjectKey('userA', 'file2'))).toString()).toBe('file two');
    await deleteDriveObject(driveObjectKey('userA', 'file1'));
    await expect(getDriveObject(driveObjectKey('userA', 'file1'))).rejects.toThrow('S3 GET failed (404)');
    expect((await getDriveObject(driveObjectKey('userA', 'file2'))).toString()).toBe('file two');
  });

  it('GET of an unknown key rejects instead of returning empty bytes', async () => {
    await expect(getDriveObject(driveObjectKey('userA', 'missing'))).rejects.toThrow(
      'S3 GET failed (404)',
    );
  });
});
