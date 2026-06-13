import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  PutObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  GetObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  DeleteObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  DeleteObjectsCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  ListObjectsV2Command: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  CopyObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
  HeadObjectCommand: vi.fn().mockImplementation(function (params) {
    return params;
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

import { StorageClient } from '../src/storage-client.js';
import type { StorageConfig } from '../src/storage-config.js';

const testConfig: StorageConfig = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  forcePathStyle: true,
};

describe('StorageClient', () => {
  let client: StorageClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new StorageClient(testConfig);
  });

  it('should upload a file and return key + etag', async () => {
    mockSend.mockResolvedValueOnce({ ETag: '"abc123"' });

    const result = await client.upload('test/file.txt', Buffer.from('hello'), 'text/plain');

    expect(result).toEqual({ key: 'test/file.txt', etag: '"abc123"' });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should upload with metadata', async () => {
    mockSend.mockResolvedValueOnce({ ETag: '"def456"' });

    const result = await client.upload('test/file.txt', Buffer.from('data'), 'application/json', {
      userId: 'user-1',
    });

    expect(result.key).toBe('test/file.txt');
  });

  it('should download a file', async () => {
    const mockStream = new Readable({ read() {} });
    mockSend.mockResolvedValueOnce({
      Body: mockStream,
      ContentType: 'text/plain',
      ContentLength: 100,
    });

    const result = await client.download('test/file.txt');

    expect(result.body).toBe(mockStream);
    expect(result.contentType).toBe('text/plain');
    expect(result.contentLength).toBe(100);
  });

  it('should delete a file', async () => {
    mockSend.mockResolvedValueOnce({});

    await client.delete('test/file.txt');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should delete many files', async () => {
    mockSend.mockResolvedValueOnce({});

    await client.deleteMany(['file1.txt', 'file2.txt']);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should get a signed URL', async () => {
    const url = await client.getSignedUrl('test/file.txt', 7200);

    expect(url).toBe('https://signed-url.example.com');
  });

  it('should list objects', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'prefix/a.txt', Size: 100, LastModified: new Date('2024-01-01') },
        { Key: 'prefix/b.txt', Size: 200, LastModified: new Date('2024-01-02') },
      ],
    });

    const result = await client.listObjects('prefix/');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      key: 'prefix/a.txt',
      size: 100,
      lastModified: new Date('2024-01-01'),
    });
  });

  it('should copy an object', async () => {
    mockSend.mockResolvedValueOnce({});

    await client.copy('source/file.txt', 'dest/file.txt');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should get object head info', async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: 'image/png',
      ContentLength: 5000,
      LastModified: new Date('2024-06-01'),
      Metadata: { userId: 'u-123' },
    });

    const result = await client.headObject('images/photo.png');

    expect(result.contentType).toBe('image/png');
    expect(result.contentLength).toBe(5000);
    expect(result.metadata).toEqual({ userId: 'u-123' });
  });
});
