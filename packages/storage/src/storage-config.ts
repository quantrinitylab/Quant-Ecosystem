import { z } from 'zod';

export const StorageProvider = z.enum(['s3', 'r2', 'minio']);
export type StorageProviderName = z.infer<typeof StorageProvider>;

export const StorageConfigSchema = z.object({
  endpoint: z.string().default('http://localhost:9000'),
  region: z.string().default('us-east-1'),
  bucket: z.string().default('quant-uploads'),
  accessKeyId: z.string().default('minioadmin'),
  secretAccessKey: z.string().default('minioadmin'),
  forcePathStyle: z.boolean().default(true),
  provider: StorageProvider.default('minio'),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

const R2_HOST_PATTERN = /\.r2\.cloudflarestorage\.com$/i;
const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|minio)(:\d+)?/i;
const INSECURE_CREDENTIALS = new Set(['minioadmin', 'minio', 'changeme', '']);

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function detectProvider(endpoint: string, explicitR2: boolean): StorageProviderName {
  if (explicitR2) return 'r2';
  try {
    if (R2_HOST_PATTERN.test(new URL(endpoint).host)) return 'r2';
  } catch {
    /* fall through to heuristics below */
  }
  if (LOCAL_HOST_PATTERN.test(endpoint)) return 'minio';
  return 's3';
}

/**
 * Resolve storage configuration from the environment.
 *
 * Precedence is exactly as mandated:
 *   CLOUDFLARE_R2_ENDPOINT  ->  R2_ENDPOINT  ->  S3_ENDPOINT
 * with CLOUDFLARE_R2_ACCOUNT_ID able to derive the canonical R2 endpoint.
 *
 * In production this throws rather than silently falling back to MinIO defaults.
 * A storage layer that quietly points at nothing is how mock buffers survive.
 */
export function resolveStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const explicitR2Endpoint = env.CLOUDFLARE_R2_ENDPOINT ?? env.R2_ENDPOINT;
  const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID;
  const derivedR2Endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined;

  const rawEndpoint = explicitR2Endpoint ?? derivedR2Endpoint ?? env.S3_ENDPOINT ?? '';
  const endpoint = stripTrailingSlashes(rawEndpoint);
  const provider = detectProvider(endpoint, Boolean(explicitR2Endpoint ?? derivedR2Endpoint));

  const accessKeyId = env.R2_ACCESS_KEY_ID ?? env.S3_ACCESS_KEY ?? env.AWS_ACCESS_KEY_ID ?? '';
  const secretAccessKey =
    env.R2_SECRET_ACCESS_KEY ?? env.S3_SECRET_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '';
  const bucket =
    env.ATTACHMENTS_BUCKET ?? env.R2_BUCKET ?? env.S3_BUCKET ?? 'quantmail-attachments';

  // R2 is single-region and requires the literal region "auto".
  const region = provider === 'r2' ? 'auto' : (env.S3_REGION ?? env.AWS_REGION ?? 'us-east-1');

  const forcePathStyle =
    env.S3_FORCE_PATH_STYLE !== undefined
      ? env.S3_FORCE_PATH_STYLE === 'true'
      : provider === 'minio';

  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!endpoint) missing.push('CLOUDFLARE_R2_ENDPOINT | R2_ENDPOINT | S3_ENDPOINT');
    if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID | S3_ACCESS_KEY');
    if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY | S3_SECRET_KEY');
    if (missing.length > 0) {
      throw new Error(`Object storage is not configured. Missing: ${missing.join(', ')}`);
    }
    if (
      INSECURE_CREDENTIALS.has(accessKeyId) ||
      INSECURE_CREDENTIALS.has(secretAccessKey) ||
      provider === 'minio'
    ) {
      throw new Error(
        'Refusing to start: production object storage resolved to development credentials.',
      );
    }
  }

  return StorageConfigSchema.parse({
    endpoint: endpoint || 'http://localhost:9000',
    region,
    bucket,
    accessKeyId: accessKeyId || 'minioadmin',
    secretAccessKey: secretAccessKey || 'minioadmin',
    forcePathStyle,
    provider,
  });
}
