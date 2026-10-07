import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DeepfakeMarkerData } from '../types.js';

export interface DeepfakeMarkerOptions {
  secretKey: string;
}

export class DeepfakeMarker {
  private registry = new Map<string, DeepfakeMarkerData>();
  private secretKey: string;

  constructor(options: DeepfakeMarkerOptions) {
    if (!options?.secretKey || options.secretKey.length === 0) {
      throw new Error(
        'DeepfakeMarker requires a non-empty secretKey; refusing to sign with a default key',
      );
    }
    this.secretKey = options.secretKey;
  }

  embed(assetId: string, transformations: string[]): DeepfakeMarkerData {
    const marker: DeepfakeMarkerData = {
      assetId,
      timestamp: Date.now(),
      transformations: [...transformations],
      signature: this.generateSignature(assetId, transformations),
      c2paCompatible: true,
    };

    this.registry.set(assetId, marker);
    return { ...marker, transformations: [...marker.transformations] };
  }

  verify(assetId: string): { valid: boolean; marker: DeepfakeMarkerData | null } {
    const marker = this.registry.get(assetId);
    if (!marker) return { valid: false, marker: null };

    const expectedSig = this.generateSignature(assetId, marker.transformations);
    const valid = this.constantTimeEquals(marker.signature, expectedSig);
    return { valid, marker: { ...marker, transformations: [...marker.transformations] } };
  }

  hasMarker(assetId: string): boolean {
    return this.registry.has(assetId);
  }

  getTransformations(assetId: string): string[] {
    return [...(this.registry.get(assetId)?.transformations ?? [])];
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private generateSignature(assetId: string, transformations: string[]): string {
    const data = `${assetId}:${transformations.join(',')}`;
    const hmac = createHmac('sha256', this.secretKey).update(data).digest('hex');
    return `c2pa:${hmac}`;
  }
}
