// ============================================================================
// QuantEdits - Export Presets Service
// Video export presets for various platforms with custom preset support
// ============================================================================

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  format: string;
}

export interface ExportPreset {
  id: string;
  name: string;
  platform: string;
  settings: ExportSettings;
  isCustom: boolean;
}

const BUILT_IN_PRESETS: ExportPreset[] = [
  {
    id: 'preset-instagram-reels',
    name: 'Instagram Reels',
    platform: 'instagram',
    settings: { width: 1080, height: 1920, fps: 30, bitrate: 8000, codec: 'h264', format: 'mp4' },
    isCustom: false,
  },
  {
    id: 'preset-tiktok',
    name: 'TikTok',
    platform: 'tiktok',
    settings: { width: 1080, height: 1920, fps: 30, bitrate: 6000, codec: 'h264', format: 'mp4' },
    isCustom: false,
  },
  {
    id: 'preset-youtube',
    name: 'YouTube (1080p)',
    platform: 'youtube',
    settings: { width: 1920, height: 1080, fps: 30, bitrate: 12000, codec: 'h264', format: 'mp4' },
    isCustom: false,
  },
  {
    id: 'preset-youtube-shorts',
    name: 'YouTube Shorts',
    platform: 'youtube',
    settings: { width: 1080, height: 1920, fps: 30, bitrate: 8000, codec: 'h264', format: 'mp4' },
    isCustom: false,
  },
  {
    id: 'preset-twitter',
    name: 'Twitter/X',
    platform: 'twitter',
    settings: { width: 1280, height: 720, fps: 30, bitrate: 5000, codec: 'h264', format: 'mp4' },
    isCustom: false,
  },
  {
    id: 'preset-4k-cinema',
    name: '4K Cinema',
    platform: 'cinema',
    settings: { width: 3840, height: 2160, fps: 24, bitrate: 50000, codec: 'h265', format: 'mp4' },
    isCustom: false,
  },
];

export class ExportPresetsService {
  private customPresets: Map<string, ExportPreset> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `custom-preset-${this.idCounter}`;
  }

  getPresets(): ExportPreset[] {
    const builtIn = BUILT_IN_PRESETS.map((p) => ({ ...p, settings: { ...p.settings } }));
    const custom = Array.from(this.customPresets.values()).map((p) => ({
      ...p,
      settings: { ...p.settings },
    }));
    return [...builtIn, ...custom];
  }

  getPreset(id: string): ExportPreset | null {
    const builtIn = BUILT_IN_PRESETS.find((p) => p.id === id);
    if (builtIn) {
      return { ...builtIn, settings: { ...builtIn.settings } };
    }

    const custom = this.customPresets.get(id);
    if (custom) {
      return { ...custom, settings: { ...custom.settings } };
    }

    return null;
  }

  createCustom(name: string, settings: ExportSettings): ExportPreset {
    const preset: ExportPreset = {
      id: this.generateId(),
      name,
      platform: 'custom',
      settings: { ...settings },
      isCustom: true,
    };

    this.customPresets.set(preset.id, preset);
    return { ...preset, settings: { ...preset.settings } };
  }

  deleteCustom(id: string): boolean {
    return this.customPresets.delete(id);
  }

  getForPlatform(platform: string): ExportPreset[] {
    const all = this.getPresets();
    return all.filter((p) => p.platform === platform);
  }

  estimateFileSize(duration: number, settings: ExportSettings): number {
    // Estimate in bytes: bitrate (kbps) * duration (seconds) / 8 * 1024
    return (settings.bitrate * duration * 1024) / 8;
  }
}
