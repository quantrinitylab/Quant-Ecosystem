import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { z } from 'zod';
import crypto from 'node:crypto';

export const CDNConfigSchema = z.object({
  distributionId: z.string().min(1),
  keyPairId: z.string().min(1),
  privateKey: z.string().min(1),
  domain: z.string().min(1),
  region: z.string().default('us-east-1'),
});

export type CDNConfig = z.infer<typeof CDNConfigSchema>;

export interface InvalidationResult {
  invalidationId: string;
  paths: string[];
  status: string;
}

/**
 * CDNService - Real AWS CloudFront integration
 *
 * Provides presigned URL generation for private content distribution
 * and cache invalidation using the AWS CloudFront SDK.
 */
export class CDNService {
  private readonly client: CloudFrontClient;
  private readonly config: CDNConfig;

  constructor(config: CDNConfig) {
    this.config = CDNConfigSchema.parse(config);
    this.client = new CloudFrontClient({ region: this.config.region });
  }

  /**
   * Generate a presigned download URL for a CloudFront resource
   * @param key - Object key/path in the distribution
   * @param expiresInSeconds - URL validity duration (default 1 hour)
   */
  getPresignedUrl(key: string, expiresInSeconds: number = 3600): string {
    const url = `https://${this.config.domain}/${key}`;
    const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    return getSignedUrl({
      url,
      keyPairId: this.config.keyPairId,
      privateKey: this.config.privateKey,
      dateLessThan,
    });
  }

  /**
   * Invalidate cached paths in CloudFront
   * @param paths - Array of paths to invalidate (e.g., ['/videos/*', '/images/thumbnail.jpg'])
   */
  async invalidate(paths: string[]): Promise<InvalidationResult> {
    const callerReference = crypto.randomUUID();

    const command = new CreateInvalidationCommand({
      DistributionId: this.config.distributionId,
      InvalidationBatch: {
        CallerReference: callerReference,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    });

    const response = await this.client.send(command);

    return {
      invalidationId: response.Invalidation?.Id ?? callerReference,
      paths,
      status: response.Invalidation?.Status ?? 'Unknown',
    };
  }
}
