import type { StorageClient } from './storage-client.js';

export interface LfsUploadAction {
  href: string;
  header?: Record<string, string>;
  expires_in: number;
}

export interface LfsVerifyAction {
  href: string;
  header?: Record<string, string>;
  expires_in: number;
}

export interface LfsObjectActions {
  upload?: LfsUploadAction;
  download?: LfsUploadAction;
  verify?: LfsVerifyAction;
}

export interface LfsObjectResponse {
  oid: string;
  size: number;
  authenticated?: boolean;
  actions?: LfsObjectActions;
  error?: {
    code: number;
    message: string;
  };
}

export class LfsStorageService {
  constructor(private readonly storageClient: StorageClient) {}

  /**
   * Generates standard Git LFS 2-level directory sharding key:
   * owner/repo/lfs/ab/cd/abcdef...
   */
  getLfsObjectKey(owner: string, repo: string, oid: string): string {
    const cleanOid = oid.toLowerCase().trim();
    if (!/^[a-f0-9]{64}$/.test(cleanOid)) {
      throw new Error(`Invalid Git LFS OID: expected 64 hex characters, got ${oid}`);
    }
    const cleanOwner = owner.toLowerCase().trim();
    const cleanRepo = repo
      .toLowerCase()
      .trim()
      .replace(/\.git$/, '');
    const prefix1 = cleanOid.slice(0, 2);
    const prefix2 = cleanOid.slice(2, 4);
    return `${cleanOwner}/${cleanRepo}/lfs/${prefix1}/${prefix2}/${cleanOid}`;
  }

  async generateLfsUploadUrl(
    owner: string,
    repo: string,
    oid: string,
    size: number,
    expiresIn = 3600,
  ): Promise<{ uploadUrl: string; headers: Record<string, string>; expiresIn: number }> {
    const key = this.getLfsObjectKey(owner, repo, oid);
    const signed = await this.storageClient.getSignedUploadUrl({
      key,
      contentType: 'application/octet-stream',
      contentLength: size,
      expiresIn,
      maxBytes: Math.max(size, 5 * 1024 * 1024 * 1024), // Support up to 5GB LFS object
    });

    return {
      uploadUrl: signed.url,
      headers: signed.requiredHeaders,
      expiresIn,
    };
  }

  async generateLfsDownloadUrl(
    owner: string,
    repo: string,
    oid: string,
    expiresIn = 3600,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const key = this.getLfsObjectKey(owner, repo, oid);
    const downloadUrl = await this.storageClient.getSignedUrl(key, expiresIn);
    return {
      downloadUrl,
      expiresIn,
    };
  }

  async verifyLfsObject(
    owner: string,
    repo: string,
    oid: string,
    expectedSize: number,
  ): Promise<{ verified: boolean; actualSize?: number }> {
    const key = this.getLfsObjectKey(owner, repo, oid);
    try {
      const actualSize = await this.storageClient.getObjectSize(key);
      if (actualSize === null || actualSize === undefined) {
        return { verified: false };
      }
      return {
        verified: actualSize === expectedSize,
        actualSize,
      };
    } catch {
      return { verified: false };
    }
  }

  async objectExists(owner: string, repo: string, oid: string): Promise<boolean> {
    const key = this.getLfsObjectKey(owner, repo, oid);
    try {
      const size = await this.storageClient.getObjectSize(key);
      return size !== null && size !== undefined;
    } catch {
      return false;
    }
  }
}
