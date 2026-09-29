import { createAppError } from '@quant/server-core';

export interface Asset {
  id: string;
  projectId: string;
  filename: string;
  type: string;
  size: number;
  uploadedAt: Date;
}

export interface UploadAssetInput {
  projectId: string;
  filename: string;
  type: string;
  size: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  assetId: string;
  expiresAt: Date;
}

export class AssetService {
  private assets: Asset[] = [];
  private idCounter = 0;

  async uploadAsset(input: UploadAssetInput): Promise<Asset> {
    this.idCounter++;
    const asset: Asset = {
      id: `asset-${this.idCounter}`,
      projectId: input.projectId,
      filename: input.filename,
      type: input.type,
      size: input.size,
      uploadedAt: new Date(),
    };

    this.assets.push(asset);
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    return this.assets
      .filter((a) => a.projectId === projectId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async getAsset(assetId: string): Promise<Asset> {
    const asset = this.assets.find((a) => a.id === assetId);

    if (!asset) {
      throw createAppError('Asset not found', 404, 'ASSET_NOT_FOUND');
    }

    return asset;
  }

  async deleteAsset(assetId: string): Promise<void> {
    const index = this.assets.findIndex((a) => a.id === assetId);

    if (index < 0) {
      throw createAppError('Asset not found', 404, 'ASSET_NOT_FOUND');
    }

    this.assets.splice(index, 1);
  }

  async generateUploadUrl(
    userId: string,
    filename: string,
    contentType: string,
  ): Promise<UploadUrlResult> {
    this.idCounter++;
    const assetId = `asset-${this.idCounter}`;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    return {
      uploadUrl: `https://storage.quant.example.com/uploads/${userId}/${assetId}/${filename}?content-type=${encodeURIComponent(contentType)}`,
      assetId,
      expiresAt,
    };
  }
}
