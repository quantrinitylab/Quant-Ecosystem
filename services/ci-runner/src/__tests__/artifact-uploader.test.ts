import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArtifactUploader } from '../artifact-uploader.js';

function createMockStorageClient() {
  return {
    upload: vi.fn().mockResolvedValue({ key: '', etag: '' }),
    download: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    getSignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed-url'),
    listObjects: vi.fn(),
    copy: vi.fn(),
    headObject: vi.fn(),
  };
}

describe('ArtifactUploader', () => {
  let uploader: ArtifactUploader;
  let storage: ReturnType<typeof createMockStorageClient>;

  beforeEach(() => {
    storage = createMockStorageClient();
    uploader = new ArtifactUploader(storage as never);
  });

  describe('uploadArtifacts', () => {
    it('uploads artifacts and returns results with keys and sizes', async () => {
      const content = {
        'dist/index.js': Buffer.from('console.log("hello")'),
        'dist/index.d.ts': Buffer.from('export {}'),
      };

      const results = await uploader.uploadArtifacts(
        'job-123',
        ['dist/index.js', 'dist/index.d.ts'],
        content,
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        path: 'dist/index.js',
        key: 'ci-artifacts/job-123/dist/index.js',
        size: Buffer.from('console.log("hello")').byteLength,
      });
      expect(results[1]).toEqual({
        path: 'dist/index.d.ts',
        key: 'ci-artifacts/job-123/dist/index.d.ts',
        size: Buffer.from('export {}').byteLength,
      });

      expect(storage.upload).toHaveBeenCalledTimes(2);
      expect(storage.upload).toHaveBeenCalledWith(
        'ci-artifacts/job-123/dist/index.js',
        content['dist/index.js'],
        'application/octet-stream',
        { jobId: 'job-123', originalPath: 'dist/index.js' },
      );
    });

    it('skips paths that have no matching content', async () => {
      const content = {
        'dist/index.js': Buffer.from('code'),
      };

      const results = await uploader.uploadArtifacts(
        'job-456',
        ['dist/index.js', 'dist/missing.js'],
        content,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('dist/index.js');
      expect(storage.upload).toHaveBeenCalledTimes(1);
    });

    it('handles empty paths array', async () => {
      const results = await uploader.uploadArtifacts('job-789', [], {});
      expect(results).toHaveLength(0);
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('getArtifactUrl', () => {
    it('returns a signed URL from storage', async () => {
      const url = await uploader.getArtifactUrl('ci-artifacts/job-123/dist/index.js');

      expect(url).toBe('https://storage.example.com/signed-url');
      expect(storage.getSignedUrl).toHaveBeenCalledWith('ci-artifacts/job-123/dist/index.js', 3600);
    });
  });
});
