import type { StyleTransferConfig, FaceDetection } from '../types.js';

interface StyleResult {
  applied: boolean;
  region: 'face' | 'full_frame';
  stylePreset: string;
  intensity: number;
  maskBounds: { x: number; y: number; width: number; height: number } | null;
}

const STYLE_PRESETS = new Set([
  'oil_painting',
  'watercolor',
  'sketch',
  'pop_art',
  'anime',
  'pixel_art',
  'impressionist',
  'cubist',
]);

export class StyleTransfer {
  private config: StyleTransferConfig;

  constructor(config: StyleTransferConfig) {
    this.config = config;
  }

  apply(face: FaceDetection | null): StyleResult {
    if (!STYLE_PRESETS.has(this.config.stylePreset)) {
      return {
        applied: false,
        region: 'full_frame',
        stylePreset: this.config.stylePreset,
        intensity: 0,
        maskBounds: null,
      };
    }

    if (this.config.faceOnly && face) {
      return {
        applied: true,
        region: 'face',
        stylePreset: this.config.stylePreset,
        intensity: this.config.intensity,
        maskBounds: face.boundingBox,
      };
    }

    // faceOnly requested but no face detected: fail closed (do not apply to full frame).
    if (this.config.faceOnly && !face) {
      return {
        applied: false,
        region: 'face',
        stylePreset: this.config.stylePreset,
        intensity: 0,
        maskBounds: null,
      };
    }

    return {
      applied: true,
      region: this.config.faceOnly ? 'face' : 'full_frame',
      stylePreset: this.config.stylePreset,
      intensity: this.config.intensity,
      maskBounds: face?.boundingBox ?? null,
    };
  }

  getPresets(): string[] {
    return [...STYLE_PRESETS];
  }

  setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity));
  }

  setPreset(preset: string): boolean {
    if (!STYLE_PRESETS.has(preset)) return false;
    this.config.stylePreset = preset;
    return true;
  }
}
