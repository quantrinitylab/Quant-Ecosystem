import { createHmac } from 'node:crypto';
import type { DeepfakeMarkerData } from '../types.js';

const DEFAULT_SECRET = 'quant-ar-lenses-default-hmac-key';

export interface DeepfakeMarkerOptions {
  secretKey?: string;
}

export class DeepfakeMarker {
  private registry = new Map<string, DeepfakeMarkerData>();
  private secretKey: string;

  constructor(options?: DeepfakeMarkerOptions) {
    this.secretKey = options?.secretKey ?? DEFAULT_SECRET;
  }

  embed(assetId: string, transformations: string[]): DeepfakeMarkerData {
    const marker: DeepfakeMarkerData = {
      assetId,
      timestamp: Date.now(),
      transformations,
      signature: this.generateSignature(assetId, transformations),
      c2paCompatible: true,
    };

    this.registry.set(assetId, marker);
    return marker;
  }

  verify(assetId: string): { valid: boolean; marker: DeepfakeMarkerData | null } {
    const marker = this.registry.get(assetId);
    if (!marker) return { valid: false, marker: null };

    const expectedSig = this.generateSignature(assetId, marker.transformations);
    const valid = marker.signature === expectedSig;
    return { valid, marker };
  }

  hasMarker(assetId: string): boolean {
    return this.registry.has(assetId);
  }

  getTransformations(assetId: string): string[] {
    return this.registry.get(assetId)?.transformations ?? [];
  }

  private generateSignature(assetId: string, transformations: string[]): string {
    const data = `${assetId}:${transformations.join(',')}`;
    const hmac = createHmac('sha256', this.secretKey).update(data).digest('hex');
    return `c2pa:${hmac}`;
  }
}
