// ============================================================================
// QuantTube - Quality Selector Service
// Video quality management with auto-detection and bandwidth estimation
// ============================================================================

export type VideoQuality = '360p' | '480p' | '720p' | '1080p' | '1440p' | '4k' | 'auto';

export interface QualityOption {
  quality: VideoQuality;
  bitrate: number;
  available: boolean;
  label: string;
}

const QUALITY_BITRATES: Record<Exclude<VideoQuality, 'auto'>, number> = {
  '360p': 1000,
  '480p': 2500,
  '720p': 5000,
  '1080p': 8000,
  '1440p': 16000,
  '4k': 35000,
};

const QUALITY_LABELS: Record<Exclude<VideoQuality, 'auto'>, string> = {
  '360p': '360p (SD)',
  '480p': '480p (SD)',
  '720p': '720p (HD)',
  '1080p': '1080p (Full HD)',
  '1440p': '1440p (2K)',
  '4k': '4K (Ultra HD)',
};

export class QualitySelectorService {
  private currentQuality: VideoQuality = 'auto';
  private preferredQuality: VideoQuality = 'auto';
  private autoEnabled = true;
  private videoQualities: Map<string, VideoQuality[]> = new Map();
  private bandwidthSamples: number[] = [];

  getAvailableQualities(videoId: string): QualityOption[] {
    const available = this.videoQualities.get(videoId) ?? ['360p', '480p', '720p', '1080p'];

    const options: QualityOption[] = [];
    const allQualities: Exclude<VideoQuality, 'auto'>[] = [
      '360p',
      '480p',
      '720p',
      '1080p',
      '1440p',
      '4k',
    ];

    for (const q of allQualities) {
      options.push({
        quality: q,
        bitrate: QUALITY_BITRATES[q],
        available: available.includes(q),
        label: QUALITY_LABELS[q],
      });
    }

    return options;
  }

  setQuality(quality: VideoQuality): void {
    this.currentQuality = quality;
    if (quality !== 'auto') {
      this.autoEnabled = false;
    }
  }

  getCurrentQuality(): VideoQuality {
    return this.currentQuality;
  }

  getPreferred(): VideoQuality {
    return this.preferredQuality;
  }

  setPreferred(quality: VideoQuality): void {
    this.preferredQuality = quality;
  }

  isAutoEnabled(): boolean {
    return this.autoEnabled;
  }

  setAutoQuality(enabled: boolean): void {
    this.autoEnabled = enabled;
    if (enabled) {
      this.currentQuality = 'auto';
    }
  }

  estimateBandwidth(): number {
    if (this.bandwidthSamples.length === 0) {
      return 10000; // Default 10 Mbps
    }

    const sum = this.bandwidthSamples.reduce((acc, val) => acc + val, 0);
    return sum / this.bandwidthSamples.length;
  }

  recommendQuality(bandwidth: number): VideoQuality {
    const qualities: Exclude<VideoQuality, 'auto'>[] = [
      '4k',
      '1440p',
      '1080p',
      '720p',
      '480p',
      '360p',
    ];

    for (const q of qualities) {
      if (bandwidth >= QUALITY_BITRATES[q] * 1.2) {
        return q;
      }
    }

    return '360p';
  }

  addBandwidthSample(kbps: number): void {
    this.bandwidthSamples.push(kbps);
    if (this.bandwidthSamples.length > 10) {
      this.bandwidthSamples.shift();
    }
  }

  setVideoQualities(videoId: string, qualities: VideoQuality[]): void {
    this.videoQualities.set(videoId, qualities);
  }
}
