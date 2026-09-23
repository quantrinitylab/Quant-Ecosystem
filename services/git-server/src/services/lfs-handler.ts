import { z } from 'zod';
import type { LfsStorageService, LfsObjectResponse } from '@quant/storage';

export const LfsBatchObjectSchema = z.object({
  oid: z.string().regex(/^[a-f0-9]{64}$/i, 'OID must be a 64-character hex string'),
  size: z.number().int().nonnegative('Size must be a non-negative integer'),
});

export const LfsBatchRequestSchema = z.object({
  operation: z.enum(['upload', 'download']),
  transfers: z.array(z.string()).optional(),
  ref: z.object({ name: z.string() }).optional(),
  objects: z.array(LfsBatchObjectSchema).min(1, 'Objects array must not be empty'),
  hash_algo: z.string().optional().default('sha256'),
});

export const LfsVerifyRequestSchema = z.object({
  oid: z.string().regex(/^[a-f0-9]{64}$/i, 'OID must be a 64-character hex string'),
  size: z.number().int().nonnegative('Size must be a non-negative integer'),
});

export type LfsBatchRequest = z.infer<typeof LfsBatchRequestSchema>;
export type LfsVerifyRequest = z.infer<typeof LfsVerifyRequestSchema>;

export class LfsHandlerService {
  constructor(
    private readonly lfsStorage: LfsStorageService,
    private readonly serverBaseUrl: string = 'http://localhost:3020',
  ) {}

  async processBatch(
    owner: string,
    repo: string,
    req: LfsBatchRequest,
    authToken?: string,
  ): Promise<{ transfer: string; objects: LfsObjectResponse[]; hash_algo: string }> {
    const objects: LfsObjectResponse[] = [];

    for (const obj of req.objects) {
      const oid = obj.oid.toLowerCase();
      const size = obj.size;

      if (req.operation === 'upload') {
        const upload = await this.lfsStorage.generateLfsUploadUrl(owner, repo, oid, size);
        const verifyHref = `${this.serverBaseUrl}/${owner}/${repo}/info/lfs/objects/verify`;

        objects.push({
          oid,
          size,
          authenticated: true,
          actions: {
            upload: {
              href: upload.uploadUrl,
              header: upload.headers,
              expires_in: upload.expiresIn,
            },
            verify: {
              href: verifyHref,
              header: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
              expires_in: 3600,
            },
          },
        });
      } else {
        // download operation
        const exists = await this.lfsStorage.objectExists(owner, repo, oid);
        if (!exists) {
          objects.push({
            oid,
            size,
            error: {
              code: 404,
              message: 'Object does not exist',
            },
          });
        } else {
          const download = await this.lfsStorage.generateLfsDownloadUrl(owner, repo, oid);
          objects.push({
            oid,
            size,
            authenticated: true,
            actions: {
              download: {
                href: download.downloadUrl,
                expires_in: download.expiresIn,
              },
            },
          });
        }
      }
    }

    return {
      transfer: 'basic',
      objects,
      hash_algo: 'sha256',
    };
  }

  async verifyObject(
    owner: string,
    repo: string,
    oid: string,
    expectedSize: number,
  ): Promise<{ success: boolean; error?: string; actualSize?: number }> {
    const result = await this.lfsStorage.verifyLfsObject(
      owner,
      repo,
      oid.toLowerCase(),
      expectedSize,
    );
    if (!result.verified) {
      if (result.actualSize !== undefined) {
        return {
          success: false,
          error: `Object size mismatch: expected ${expectedSize} bytes, found ${result.actualSize} bytes`,
          actualSize: result.actualSize,
        };
      }
      return {
        success: false,
        error: 'Object not found in storage',
      };
    }
    return { success: true, actualSize: result.actualSize };
  }
}
