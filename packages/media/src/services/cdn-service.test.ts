import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @aws-sdk/client-cloudfront
vi.mock('@aws-sdk/client-cloudfront', () => {
  const mockSend = vi.fn().mockResolvedValue({
    Invalidation: {
      Id: 'inv-123',
      Status: 'InProgress',
    },
  });

  return {
    CloudFrontClient: vi.fn().mockImplementation(function () {
      return { send: mockSend };
    }),
    CreateInvalidationCommand: vi.fn().mockImplementation(function (input: unknown) {
      return { input };
    }),
  };
});

// Mock @aws-sdk/cloudfront-signer
vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: vi.fn().mockImplementation(({ url }: { url: string }) => {
    return `${url}?Policy=abc&Signature=def&Key-Pair-Id=keypair123`;
  }),
}));

import { CDNService, CDNConfigSchema } from './cdn-service';
import type { CDNConfig } from './cdn-service';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const validConfig = {
  distributionId: 'E1A2B3C4D5',
  keyPairId: 'K1234ABCDE',
  privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
  domain: 'd111111abcdef8.cloudfront.net',
  region: 'us-east-1',
};

describe('CDNService', () => {
  let service: CDNService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CDNService(validConfig);
  });

  describe('constructor', () => {
    it('creates CloudFrontClient with correct region', () => {
      expect(CloudFrontClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    });

    it('uses default region when not specified', () => {
      const configWithoutRegion = {
        distributionId: 'E1A2B3C4D5',
        keyPairId: 'K1234ABCDE',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        domain: 'cdn.example.com',
      } as CDNConfig;
      new CDNService(configWithoutRegion);
      expect(CloudFrontClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    });
  });

  describe('getPresignedUrl', () => {
    it('generates correct URL with domain and key', () => {
      const result = service.getPresignedUrl('videos/video1.mp4');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://d111111abcdef8.cloudfront.net/videos/video1.mp4',
          keyPairId: 'K1234ABCDE',
          privateKey: validConfig.privateKey,
          dateLessThan: expect.any(String),
        }),
      );
      expect(result).toContain('https://d111111abcdef8.cloudfront.net/videos/video1.mp4');
    });

    it('uses custom expiration time', () => {
      service.getPresignedUrl('images/photo.jpg', 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://d111111abcdef8.cloudfront.net/images/photo.jpg',
          dateLessThan: expect.any(String),
        }),
      );
    });

    it('defaults to 3600 seconds expiration', () => {
      const before = Date.now();
      service.getPresignedUrl('file.txt');
      const after = Date.now();

      const call = vi.mocked(getSignedUrl).mock.calls[0]![0] as { dateLessThan: string };
      const dateLessThan = new Date(call.dateLessThan).getTime();

      // Should be approximately 1 hour from now
      expect(dateLessThan).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(dateLessThan).toBeLessThanOrEqual(after + 3600 * 1000);
    });
  });

  describe('invalidate', () => {
    it('sends CreateInvalidationCommand with correct paths', async () => {
      const paths = ['/videos/*', '/images/thumbnail.jpg'];

      const result = await service.invalidate(paths);

      expect(CreateInvalidationCommand).toHaveBeenCalledWith({
        DistributionId: 'E1A2B3C4D5',
        InvalidationBatch: {
          CallerReference: expect.any(String),
          Paths: {
            Quantity: 2,
            Items: ['/videos/*', '/images/thumbnail.jpg'],
          },
        },
      });
      expect(result.invalidationId).toBe('inv-123');
      expect(result.paths).toEqual(paths);
      expect(result.status).toBe('InProgress');
    });

    it('returns callerReference when Invalidation.Id is not present', async () => {
      const mockClient = vi.mocked(CloudFrontClient);
      const mockSend = mockClient.mock.results[0]!.value.send;
      mockSend.mockResolvedValueOnce({ Invalidation: undefined });

      const result = await service.invalidate(['/path']);

      expect(result.invalidationId).toBeDefined();
      expect(result.status).toBe('Unknown');
    });
  });

  describe('CDNConfigSchema validation', () => {
    it('rejects empty distributionId', () => {
      expect(() => CDNConfigSchema.parse({ ...validConfig, distributionId: '' })).toThrow();
    });

    it('rejects empty keyPairId', () => {
      expect(() => CDNConfigSchema.parse({ ...validConfig, keyPairId: '' })).toThrow();
    });

    it('rejects empty privateKey', () => {
      expect(() => CDNConfigSchema.parse({ ...validConfig, privateKey: '' })).toThrow();
    });

    it('rejects empty domain', () => {
      expect(() => CDNConfigSchema.parse({ ...validConfig, domain: '' })).toThrow();
    });

    it('accepts valid config', () => {
      const result = CDNConfigSchema.parse(validConfig);
      expect(result.distributionId).toBe('E1A2B3C4D5');
      expect(result.region).toBe('us-east-1');
    });
  });
});
