import type { SynthIDConfig } from '../types.js';

export interface WatermarkMetadata {
  model: string;
  timestamp: number;
  userId: string;
}

export interface DetectionResult {
  isWatermarked: boolean;
  confidence: number;
  metadata?: WatermarkMetadata;
}

/**
 * Test/mock implementation of SynthID watermarking.
 *
 * This implementation embeds metadata by appending JSON to raw buffers
 * and detects watermarks via string search. It will NOT survive real
 * media codec pipelines (image compression, audio encoding, etc.).
 *
 * For production deployments, replace this with a codec-agnostic
 * steganography library that embeds signals into the perceptual
 * domain of the media (e.g. spectral-domain for audio, DCT-domain
 * for images).
 */
export class SynthIDWatermarker {
  private config: SynthIDConfig;
  private watermarked = new Map<string, WatermarkMetadata>();

  constructor(config?: Partial<SynthIDConfig>) {
    this.config = {
      strength: config?.strength ?? 0.8,
      algorithm: config?.algorithm ?? 'hybrid',
      includeMetadata: config?.includeMetadata ?? true,
    };
  }

  embedImage(imageBuffer: Buffer, metadata: WatermarkMetadata): Buffer {
    const marker = Buffer.from(JSON.stringify({ __synthid: true, ...metadata }));
    const result = Buffer.concat([imageBuffer, marker]);
    const key = result.toString('hex').slice(0, 32);
    this.watermarked.set(key, metadata);
    return result;
  }

  embedAudio(audioBuffer: Buffer, metadata: WatermarkMetadata): Buffer {
    const marker = Buffer.from(JSON.stringify({ __synthid_audio: true, ...metadata }));
    const result = Buffer.concat([audioBuffer, marker]);
    const key = result.toString('hex').slice(0, 32);
    this.watermarked.set(key, metadata);
    return result;
  }

  detect(buffer: Buffer, _mediaType: 'image' | 'audio'): DetectionResult {
    const content = buffer.toString();
    const hasSynthId =
      content.includes('"__synthid":true') || content.includes('"__synthid_audio":true');
    if (!hasSynthId) {
      return { isWatermarked: false, confidence: 0.95 };
    }
    const markerStart = content.lastIndexOf('{');
    try {
      const parsed = JSON.parse(content.slice(markerStart));
      return {
        isWatermarked: true,
        confidence: this.config.strength,
        metadata: {
          model: parsed.model,
          timestamp: parsed.timestamp,
          userId: parsed.userId,
        },
      };
    } catch {
      return { isWatermarked: true, confidence: 0.5 };
    }
  }

  getConfig(): SynthIDConfig {
    return { ...this.config };
  }
}
