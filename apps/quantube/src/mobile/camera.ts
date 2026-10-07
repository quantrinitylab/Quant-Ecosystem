// Quantads - Camera Service
// Mobile camera functionality for advertising platform

export interface CameraConfig {
  resolution: CameraResolution;
  flash: 'on' | 'off' | 'auto';
  facing: 'front' | 'back';
  stabilization: boolean;
  hdr: boolean;
  gridOverlay: boolean;
}

export type CameraResolution = '720p' | '1080p' | '4k' | 'max';

export interface PhotoResult {
  uri: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'heif';
  sizeBytes: number;
  metadata: PhotoMetadata;
}

export interface PhotoMetadata {
  timestamp: number;
  location?: { latitude: number; longitude: number };
  device: string;
  settings: CameraConfig;
}

export interface VideoRecordingConfig {
  maxDuration: number;
  quality: 'low' | 'medium' | 'high' | 'max';
  audioBitrate: number;
  videoBitrate: number;
  fps: 30 | 60 | 120;
}

export interface VideoResult {
  uri: string;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
  thumbnailUri: string;
}

export interface QRScanResult {
  type: 'qr' | 'barcode_ean' | 'barcode_upc' | 'barcode_code128';
  data: string;
  bounds: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

export interface AROverlayConfig {
  type: 'product_placement';
  intensity: number;
  realTimePreview: boolean;
  customAssets?: string[];
}

export interface ImageFilter {
  name: string;
  intensity: number;
  params: Record<string, number>;
}

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: number;
}

export interface GalleryOptions {
  mediaType: 'photo' | 'video' | 'both';
  maxSelection: number;
  quality: number;
}

export class CameraService {
  private currentConfig: CameraConfig = {
    resolution: '1080p',
    flash: 'auto',
    facing: 'back',
    stabilization: true,
    hdr: false,
    gridOverlay: false,
  };
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private availableFilters: ImageFilter[] = [];

  constructor() {
    this.initializeFilters();
  }

  private initializeFilters(): void {
    this.availableFilters = [
      { name: 'vivid', intensity: 1.0, params: { saturation: 1.3, contrast: 1.1 } },
      { name: 'mono', intensity: 1.0, params: { saturation: 0, brightness: 1.05 } },
      { name: 'warm', intensity: 1.0, params: { temperature: 1.2, tint: 0.05 } },
      { name: 'cool', intensity: 1.0, params: { temperature: 0.8, tint: -0.05 } },
      { name: 'dramatic', intensity: 1.0, params: { contrast: 1.4, shadows: -0.2 } },
      { name: 'fade', intensity: 1.0, params: { contrast: 0.8, brightness: 1.1 } },
    ];
  }

  public async capturePhoto(config?: Partial<CameraConfig>): Promise<PhotoResult> {
    const mergedConfig = { ...this.currentConfig, ...config };
    const resolution = this.getResolutionDimensions(mergedConfig.resolution);
    return {
      uri: `file:///photos/${Date.now()}.jpg`,
      width: resolution.width,
      height: resolution.height,
      format: 'jpeg',
      sizeBytes: resolution.width * resolution.height * 0.3,
      metadata: { timestamp: Date.now(), device: 'mobile', settings: mergedConfig },
    };
  }

  private getResolutionDimensions(res: CameraResolution): { width: number; height: number } {
    switch (res) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      case '4k':
        return { width: 3840, height: 2160 };
      case 'max':
        return { width: 4032, height: 3024 };
    }
  }

  public async recordVideo(config?: Partial<VideoRecordingConfig>): Promise<VideoResult> {
    const defaults: VideoRecordingConfig = {
      maxDuration: 300,
      quality: 'high',
      audioBitrate: 128000,
      videoBitrate: 8000000,
      fps: 30,
    };
    const mergedConfig = { ...defaults, ...config };
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    return {
      uri: `file:///videos/${Date.now()}.mp4`,
      duration: mergedConfig.maxDuration,
      width: 1920,
      height: 1080,
      sizeBytes: (mergedConfig.videoBitrate * mergedConfig.maxDuration) / 8,
      thumbnailUri: `file:///thumbnails/${Date.now()}.jpg`,
    };
  }

  public stopRecording(): void {
    this.isRecording = false;
  }

  public getRecordingDuration(): number {
    if (!this.isRecording) return 0;
    return (Date.now() - this.recordingStartTime) / 1000;
  }

  public async scanQR(): Promise<QRScanResult | null> {
    return {
      type: 'qr',
      data: 'https://quantads.quant.app/scanned',
      bounds: { x: 100, y: 100, width: 200, height: 200 },
      timestamp: Date.now(),
    };
  }

  public async arOverlay(config: AROverlayConfig): Promise<{ active: boolean; fps: number }> {
    return { active: config.realTimePreview, fps: 30 };
  }

  public async processImage(
    _uri: string,
    _filters: ImageFilter[],
    crop?: CropOptions,
  ): Promise<PhotoResult> {
    const processedUri = `file:///processed/${Date.now()}.jpg`;
    return {
      uri: processedUri,
      width: crop?.width || 1920,
      height: crop?.height || 1080,
      format: 'jpeg',
      sizeBytes: 500000,
      metadata: { timestamp: Date.now(), device: 'mobile', settings: this.currentConfig },
    };
  }

  public async pickFromGallery(options?: Partial<GalleryOptions>): Promise<PhotoResult[]> {
    const defaults: GalleryOptions = { mediaType: 'both', maxSelection: 10, quality: 0.8 };
    const mergedOptions = { ...defaults, ...options };
    return Array.from({ length: Math.min(mergedOptions.maxSelection, 3) }, (_, i) => ({
      uri: `file:///gallery/selected_${i}.jpg`,
      width: 1920,
      height: 1080,
      format: 'jpeg' as const,
      sizeBytes: 400000,
      metadata: {
        timestamp: Date.now() - i * 1000,
        device: 'mobile',
        settings: this.currentConfig,
      },
    }));
  }

  public setConfig(config: Partial<CameraConfig>): void {
    this.currentConfig = { ...this.currentConfig, ...config };
  }

  public getConfig(): CameraConfig {
    return { ...this.currentConfig };
  }

  public getAvailableFilters(): ImageFilter[] {
    return [...this.availableFilters];
  }

  public switchCamera(): void {
    this.currentConfig.facing = this.currentConfig.facing === 'front' ? 'back' : 'front';
  }

  public toggleFlash(): void {
    const modes: Array<'on' | 'off' | 'auto'> = ['off', 'auto', 'on'];
    const currentIndex = modes.indexOf(this.currentConfig.flash);
    this.currentConfig.flash = modes[(currentIndex + 1) % modes.length] ?? 'off';
  }
}
