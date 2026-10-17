// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  putDriveObject,
  getDriveObject,
  driveStorageReady,
  driveStorageUnavailableReason,
} from '../services/drive-storage.service';

/**
 * The Drive S3 client is fully endpoint-driven: setting S3_ENDPOINT (or the
 * DRIVE_S3_* aliases) points it at any S3-compatible store — e.g. OCI Object
 * Storage's S3-compatible API — while unset vars keep the AWS defaults.
 *
 * Oracle-migration regression cover: a custom (non-AWS) endpoint must use
 * path-style addressing by default, because virtual-hosted style
 * (bucket.host) does not resolve on OCI's compat endpoint.
 */

const ENV_KEYS = [
  'DRIVE_S3_BUCKET',
  'DRIVE_S3_REGION',
  'DRIVE_S3_ENDPOINT',
  'DRIVE_S3_ACCESS_KEY_ID',
  'DRIVE_S3_SECRET_ACCESS_KEY',
  'DRIVE_S3_FORCE_PATH_STYLE',
  'DRIVE_MASTER_KEY',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
];

const savedEnv: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

function authHeader(): string {
  const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers?.['Authorization'] ?? '';
}

function requestUrl(): string {
  return String(fetchMock.mock.calls[0]?.[0] ?? '');
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

const AWS_VARS = {
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
};

describe('drive S3 client — AWS default (no endpoint set)', () => {
  it('keeps virtual-hosted addressing against the default AWS endpoint', async () => {
    setEnv(AWS_VARS);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/drive/u1/f1');
    const auth = authHeader();
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=test-key\/\d{8}\/us-east-1\/s3\/aws4_request/);
    expect(auth).toContain('SignedHeaders=');
    expect(auth).toContain('Signature=');
  });

  it('GET also uses virtual-hosted style and sends the SigV4 date header', async () => {
    setEnv(AWS_VARS);
    fetchMock.mockImplementationOnce(async () => new Response('data', { status: 200 }));
    const buf = await getDriveObject('drive/u1/f1');
    expect(buf.toString()).toBe('data');
    expect(requestUrl()).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/drive/u1/f1');
    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(init?.headers?.['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });
});

describe('drive S3 client — OCI Object Storage compat endpoint', () => {
  const OCI_VARS = {
    S3_ENDPOINT: 'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com',
    S3_REGION: 'ap-mumbai-1',
    S3_BUCKET: 'quantmail-drive',
    S3_ACCESS_KEY_ID: 'oci-key',
    S3_SECRET_ACCESS_KEY: 'oci-secret',
  };

  it('defaults to path-style addressing on a custom endpoint', async () => {
    setEnv(OCI_VARS);
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe(
      'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com/quantmail-drive/drive/u1/f1',
    );
    const auth = authHeader();
    expect(auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=oci-key\/\d{8}\/ap-mumbai-1\/s3\/aws4_request/,
    );
  });

  it('trims trailing slashes from a custom endpoint', async () => {
    setEnv({ ...OCI_VARS, S3_ENDPOINT: 'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com///' });
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe(
      'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com/quantmail-drive/drive/u1/f1',
    );
  });

  it('honours an explicit S3_FORCE_PATH_STYLE=false override on a custom endpoint', async () => {
    setEnv({ ...OCI_VARS, S3_FORCE_PATH_STYLE: 'false' });
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe(
      'https://quantmail-drive.qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com/drive/u1/f1',
    );
  });

  it('supports the DRIVE_S3_* aliases and prefers them over S3_*', async () => {
    setEnv({
      ...OCI_VARS,
      DRIVE_S3_BUCKET: 'drive-alias-bucket',
      DRIVE_S3_REGION: 'ap-mumbai-1',
      DRIVE_S3_ENDPOINT: 'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com',
      DRIVE_S3_ACCESS_KEY_ID: 'drive-key',
      DRIVE_S3_SECRET_ACCESS_KEY: 'drive-secret',
    });
    await putDriveObject('drive/u1/f1', Buffer.from('hello'));
    expect(requestUrl()).toBe(
      'https://qns.compat.objectstorage.ap-mumbai-1.oraclecloud.com/drive-alias-bucket/drive/u1/f1',
    );
    expect(authHeader()).toContain('Credential=drive-key/');
  });

  it('driveStorageReady is true with full OCI-shaped config + master key', () => {
    setEnv({ ...OCI_VARS, DRIVE_MASTER_KEY: 'a'.repeat(64) });
    expect(driveStorageReady()).toBe(true);
    expect(driveStorageUnavailableReason()).toBe('');
  });
});

describe('drive S3 client — not configured', () => {
  it('PUT rejects with a clear not-configured error when credentials are missing', async () => {
    setEnv({ S3_BUCKET: 'test-bucket' }); // keys missing
    await expect(putDriveObject('drive/u1/f1', Buffer.from('hello'))).rejects.toThrow(
      'Drive object storage is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('driveStorageReady is false and the reason names the env families', () => {
    expect(driveStorageReady()).toBe(false);
    expect(driveStorageUnavailableReason()).toContain('DRIVE_S3_*');
  });
});
