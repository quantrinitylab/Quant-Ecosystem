import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  PutObjectCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'PutObjectCommand' };
  }),
  GetObjectCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'GetObjectCommand' };
  }),
  DeleteObjectCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'DeleteObjectCommand' };
  }),
  DeleteObjectsCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'DeleteObjectsCommand' };
  }),
  ListObjectsV2Command: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'ListObjectsV2Command' };
  }),
  HeadObjectCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'HeadObjectCommand' };
  }),
  CopyObjectCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'CopyObjectCommand' };
  }),
  CreateMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'CreateMultipartUploadCommand' };
  }),
  UploadPartCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'UploadPartCommand' };
  }),
  CompleteMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'CompleteMultipartUploadCommand' };
  }),
  AbortMultipartUploadCommand: vi.fn().mockImplementation(function (params) {
    return { ...params, _type: 'AbortMultipartUploadCommand' };
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.quantube.in/upload-target'),
}));

import {
  CloudflareR2Client,
  createCloudflareR2Client,
  getMediaContentType,
  getMediaCacheControl,
  DEFAULT_R2_BUCKET,
  DEFAULT_PUBLIC_DOMAIN,
} from '../src/r2-client.js';

describe('CloudflareR2Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Endpoint & URL Derivation', () => {
    it('auto-derives canonical R2 endpoint from accountId', () => {
      const client = new CloudflareR2Client({
        accountId: 'acc123456789',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      });

      expect(client.endpoint).toBe('https://acc123456789.r2.cloudflarestorage.com');
      expect(client.bucket).toBe(DEFAULT_R2_BUCKET);
      expect(client.publicDomain).toBe(DEFAULT_PUBLIC_DOMAIN);
    });

    it('derives public CDN URLs with custom domain', () => {
      const client = new CloudflareR2Client({
        accountId: 'acc123',
        publicDomain: 'https://media.quantube.in',
      });

      const url = client.getPublicUrl('videos/stream123/master.m3u8');
      expect(url).toBe('https://media.quantube.in/videos/stream123/master.m3u8');
    });

    it('derives full HLS stream URLs for master and variants', () => {
      const client = new CloudflareR2Client({
        publicDomain: 'https://media.quantube.in',
      });

      const urls = client.getHlsStreamUrls('videos/video-999', ['1080p', '720p', '360p']);
      expect(urls.masterPlaylistUrl).toBe('https://media.quantube.in/videos/video-999/master.m3u8');
      expect(urls.variantUrls['1080p']).toBe(
        'https://media.quantube.in/videos/video-999/1080p/playlist.m3u8',
      );
      expect(urls.variantUrls['720p']).toBe(
        'https://media.quantube.in/videos/video-999/720p/playlist.m3u8',
      );
      expect(urls.variantUrls['360p']).toBe(
        'https://media.quantube.in/videos/video-999/360p/playlist.m3u8',
      );
    });
  });

  describe('Media MIME & Cache Headers (Zero Egress Architecture)', () => {
    it('sets correct MIME types for HLS and media chunks', () => {
      expect(getMediaContentType('video/master.m3u8')).toBe('application/vnd.apple.mpegurl');
      expect(getMediaContentType('video/1080p/segment_001.ts')).toBe('video/MP2T');
      expect(getMediaContentType('audio/speech.m4a')).toBe('audio/mp4');
      expect(getMediaContentType('captions.vtt')).toBe('text/vtt');
    });

    it('sets immutable caching for video chunks to maximise edge hits and save egress', () => {
      expect(getMediaCacheControl('segment_000.ts')).toBe('public, max-age=31536000, immutable');
      expect(getMediaCacheControl('master.m3u8')).toBe(
        'public, max-age=86400, stale-while-revalidate=300',
      );
      expect(getMediaCacheControl('thumb.jpg')).toBe('public, max-age=2592000, immutable');
    });
  });

  describe('Upload & Presigned URLs', () => {
    it('generates presigned PUT upload URL with required headers', async () => {
      const client = new CloudflareR2Client({
        accountId: 'acc-test',
      });

      const signed = await client.getSignedUploadUrl({
        key: 'uploads/raw-video.mp4',
        contentType: 'video/mp4',
        contentLength: 1048576,
      });

      expect(signed.url).toBe('https://presigned.quantube.in/upload-target');
      expect(signed.key).toBe('uploads/raw-video.mp4');
      expect(signed.method).toBe('PUT');
      expect(signed.requiredHeaders['Content-Type']).toBe('video/mp4');
      expect(signed.requiredHeaders['Content-Length']).toBe('1048576');
    });

    it('uploads buffer to R2 and returns ETag + publicUrl', async () => {
      mockSend.mockResolvedValueOnce({ ETag: '"test-etag-123"' });
      const client = new CloudflareR2Client({
        accountId: 'acc-test',
      });

      const result = await client.upload(
        'videos/video-1/master.m3u8',
        Buffer.from('#EXTM3U'),
        'application/vnd.apple.mpegurl',
      );

      expect(mockSend).toHaveBeenCalled();
      expect(result.key).toBe('videos/video-1/master.m3u8');
      expect(result.etag).toBe('"test-etag-123"');
      expect(result.publicUrl).toBe('https://media.quantube.in/videos/video-1/master.m3u8');
    });
  });

  describe('Factory helper', () => {
    it('creates CloudflareR2Client using createCloudflareR2Client', () => {
      const client = createCloudflareR2Client({ accountId: 'acc-test-99' });
      expect(client).toBeInstanceOf(CloudflareR2Client);
      expect(client.accountId).toBe('acc-test-99');
    });
  });
});
