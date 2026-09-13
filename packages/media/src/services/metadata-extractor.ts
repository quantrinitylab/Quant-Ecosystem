// ============================================================================
// Media - Metadata Extractor
// Comprehensive media metadata extraction simulation
// ============================================================================

import type {
  MediaMetadata,
  MediaType,
  ExifData,
  GPSCoordinates,
  VideoCodec,
  AudioCodec,
} from '../types';

/** Metadata extraction options */
interface ExtractionOptions {
  includeExif?: boolean;
  includeGPS?: boolean;
  includeThumbnail?: boolean;
  includeColorProfile?: boolean;
}

/** Color profile information */
interface ColorProfile {
  space: string;
  profile: string;
  depth: number;
  hasAlpha: boolean;
  isHDR: boolean;
  gamut: string;
}

/** File analysis result */
interface FileAnalysis {
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  isCorrupted: boolean;
  headerBytes: string;
}

/**
 * Magic-byte signatures for real container detection. Each signature is matched
 * at a byte `offset` (mp4 puts `ftyp` after the 4-byte box size); an optional
 * `alsoAt` refines ambiguous containers (RIFF is also WAV/AVI, so we require
 * `WEBP` at offset 8 when enough bytes are available).
 */
interface MagicSignature {
  hex: string;
  offset: number;
  mime: string;
  ext: string;
  type: MediaType;
  alsoAt?: { hex: string; offset: number };
}

const MAGIC_SIGNATURES: readonly MagicSignature[] = [
  { hex: 'ffd8ff', offset: 0, mime: 'image/jpeg', ext: 'jpg', type: 'image' },
  { hex: '89504e47', offset: 0, mime: 'image/png', ext: 'png', type: 'image' },
  { hex: '47494638', offset: 0, mime: 'image/gif', ext: 'gif', type: 'image' },
  {
    hex: '52494646',
    offset: 0,
    mime: 'image/webp',
    ext: 'webp',
    type: 'image',
    alsoAt: { hex: '57454250', offset: 8 },
  },
  { hex: '66747970', offset: 4, mime: 'video/mp4', ext: 'mp4', type: 'video' },
  { hex: '1a45dfa3', offset: 0, mime: 'video/webm', ext: 'webm', type: 'video' },
  { hex: '494433', offset: 0, mime: 'audio/mpeg', ext: 'mp3', type: 'audio' },
  { hex: '664c6143', offset: 0, mime: 'audio/flac', ext: 'flac', type: 'audio' },
];

/** Hex-encode the leading `maxBytes` of a byte array. */
function toHexPrefix(bytes: Uint8Array, maxBytes: number): string {
  let hex = '';
  for (let i = 0; i < bytes.length && i < maxBytes; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

/** Match a byte buffer against the magic-byte table; null when unknown. */
function matchMagicSignature(bytes: Uint8Array): MagicSignature | null {
  const hex = toHexPrefix(bytes, 16);
  for (const signature of MAGIC_SIGNATURES) {
    const offsetHex = hex.slice(signature.offset * 2);
    if (!offsetHex.startsWith(signature.hex)) continue;
    if (signature.alsoAt) {
      const alsoHex = hex.slice(signature.alsoAt.offset * 2);
      if (
        alsoHex.length >= signature.alsoAt.hex.length &&
        !alsoHex.startsWith(signature.alsoAt.hex)
      ) {
        continue;
      }
    }
    return signature;
  }
  return null;
}

/**
 * MetadataExtractor - Comprehensive media metadata extraction
 *
 * Extracts EXIF data, dimensions, duration, codec info,
 * GPS coordinates, bitrate, and color profile information
 * from various media file types. Simulates real metadata
 * parsing with realistic data structures.
 */
export class MetadataExtractor {
  private metadataCache: Map<string, MediaMetadata>;
  private exifCache: Map<string, ExifData>;
  private colorProfileCache: Map<string, ColorProfile>;

  constructor() {
    this.metadataCache = new Map();
    this.exifCache = new Map();
    this.colorProfileCache = new Map();
  }

  /**
   * Extract EXIF data from an image
   */
  public extractExif(
    fileId: string,
    options: {
      make?: string;
      model?: string;
      iso?: number;
      focalLength?: number;
      exposureTime?: string;
      fNumber?: number;
      flash?: boolean;
      dateTime?: string;
      software?: string;
    } = {},
  ): ExifData {
    const exif: ExifData = {
      make:
        options.make ||
        this.randomChoice(['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Apple', 'Samsung']),
      model:
        options.model ||
        this.randomChoice(['EOS R5', 'Z9', 'A7IV', 'X-T5', 'iPhone 15 Pro', 'Galaxy S24']),
      exposureTime:
        options.exposureTime || this.randomChoice(['1/125', '1/250', '1/500', '1/1000', '1/60']),
      fNumber: options.fNumber || this.randomChoice([1.4, 1.8, 2.8, 4.0, 5.6, 8.0, 11.0]),
      iso: options.iso || this.randomChoice([100, 200, 400, 800, 1600, 3200]),
      focalLength: options.focalLength || this.randomChoice([24, 35, 50, 85, 105, 200]),
      flash: options.flash !== undefined ? options.flash : Math.random() > 0.7,
      whiteBalance: this.randomChoice(['Auto', 'Daylight', 'Cloudy', 'Tungsten', 'Fluorescent']),
      dateTime: options.dateTime || new Date().toISOString(),
      software:
        options.software ||
        this.randomChoice(['Adobe Lightroom', 'Capture One', 'DxO PhotoLab', 'Luminar']),
      artist: undefined,
      copyright: undefined,
      lens: this.randomChoice([
        '24-70mm f/2.8',
        '70-200mm f/2.8',
        '50mm f/1.4',
        '85mm f/1.8',
        '16-35mm f/4',
      ]),
    };

    this.exifCache.set(fileId, exif);
    return exif;
  }

  /**
   * Get dimensions of a media file
   */
  public getDimensions(
    _fileId: string,
    options: { width?: number; height?: number; type?: MediaType } = {},
  ): {
    width: number;
    height: number;
    aspectRatio: number;
    orientation: 'landscape' | 'portrait' | 'square';
    megapixels: number;
  } {
    const width = options.width || this.randomChoice([1920, 3840, 4032, 6000, 1280, 2560]);
    const height = options.height || this.randomChoice([1080, 2160, 3024, 4000, 720, 1440]);

    const aspectRatio = width / height;
    const orientation = width > height ? 'landscape' : width < height ? 'portrait' : 'square';
    const megapixels = (width * height) / 1000000;

    return {
      width,
      height,
      aspectRatio,
      orientation,
      megapixels: Math.round(megapixels * 10) / 10,
    };
  }

  /**
   * Get duration for video/audio files
   */
  public getDuration(
    _fileId: string,
    options: { duration?: number; type?: MediaType } = {},
  ): {
    seconds: number;
    formatted: string;
    milliseconds: number;
    frames?: number;
    framerate?: number;
  } {
    const seconds = options.duration || this.randomChoice([30, 60, 120, 300, 600, 1800, 3600]);
    const type = options.type || 'video';
    const framerate = type === 'video' ? this.randomChoice([24, 25, 30, 60]) : undefined;
    const frames = framerate ? Math.round(seconds * framerate) : undefined;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const formatted =
      hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        : `${minutes}:${String(secs).padStart(2, '0')}`;

    return {
      seconds,
      formatted,
      milliseconds: seconds * 1000,
      frames,
      framerate,
    };
  }

  /**
   * Get codec information for a media file
   */
  public getCodecInfo(
    _fileId: string,
    options: { mediaType?: MediaType } = {},
  ): {
    video?: { codec: VideoCodec; profile: string; level: string; bitDepth: number };
    audio?: {
      codec: AudioCodec;
      profile: string;
      sampleRate: number;
      channels: number;
      bitDepth: number;
    };
    container: string;
    muxer: string;
  } {
    const type = options.mediaType || 'video';

    const result: {
      video?: { codec: VideoCodec; profile: string; level: string; bitDepth: number };
      audio?: {
        codec: AudioCodec;
        profile: string;
        sampleRate: number;
        channels: number;
        bitDepth: number;
      };
      container: string;
      muxer: string;
    } = {
      container: this.randomChoice(['mp4', 'webm', 'mkv', 'mov']),
      muxer: this.randomChoice(['libavformat', 'FFmpeg', 'HandBrake']),
    };

    if (type === 'video' || type === 'image') {
      result.video = {
        codec: this.randomChoice(['h264', 'h265', 'vp9', 'av1']) as VideoCodec,
        profile: this.randomChoice(['Main', 'High', 'Baseline', 'Main 10']),
        level: this.randomChoice(['4.0', '4.1', '5.0', '5.1', '5.2']),
        bitDepth: this.randomChoice([8, 10, 12]),
      };
    }

    if (type === 'video' || type === 'audio') {
      result.audio = {
        codec: this.randomChoice(['aac', 'opus', 'mp3', 'flac']) as AudioCodec,
        profile: this.randomChoice(['LC', 'HE-AAC', 'HE-AACv2']),
        sampleRate: this.randomChoice([44100, 48000, 96000]),
        channels: this.randomChoice([1, 2, 6]),
        bitDepth: this.randomChoice([16, 24, 32]),
      };
    }

    return result;
  }

  /**
   * Get GPS location from media metadata
   */
  public getGPSLocation(
    _fileId: string,
    options: { latitude?: number; longitude?: number } = {},
  ): GPSCoordinates | null {
    // Not all files have GPS data
    const hasGPS = options.latitude !== undefined || Math.random() > 0.4;
    if (!hasGPS) return null;

    // Generate realistic GPS coordinates for major cities
    const locations: GPSCoordinates[] = [
      { latitude: 40.7128, longitude: -74.006, altitude: 10, accuracy: 5 }, // New York
      { latitude: 51.5074, longitude: -0.1278, altitude: 11, accuracy: 8 }, // London
      { latitude: 35.6762, longitude: 139.6503, altitude: 40, accuracy: 3 }, // Tokyo
      { latitude: 48.8566, longitude: 2.3522, altitude: 35, accuracy: 6 }, // Paris
      { latitude: 37.7749, longitude: -122.4194, altitude: 16, accuracy: 4 }, // San Francisco
      { latitude: -33.8688, longitude: 151.2093, altitude: 58, accuracy: 10 }, // Sydney
      { latitude: 19.076, longitude: 72.8777, altitude: 14, accuracy: 7 }, // Mumbai
    ];

    if (options.latitude !== undefined && options.longitude !== undefined) {
      return {
        latitude: options.latitude,
        longitude: options.longitude,
        altitude: Math.round(Math.random() * 500),
        accuracy: Math.round(Math.random() * 20),
      };
    }

    return locations[Math.floor(Math.random() * locations.length)] ?? null;
  }

  /**
   * Get bitrate information
   */
  public getBitrate(
    _fileId: string,
    options: { size?: number; duration?: number; type?: MediaType } = {},
  ): {
    overall: number; // kbps
    video?: number;
    audio?: number;
    variableBitrate: boolean;
    maxBitrate: number;
    minBitrate: number;
    averageBitrate: number;
  } {
    const size = options.size || 50 * 1024 * 1024; // 50MB default
    const duration = options.duration || 120; // 2 min default
    const type = options.type || 'video';

    const overallBitrate = Math.round((size * 8) / (duration * 1000)); // kbps

    const result: {
      overall: number;
      video?: number;
      audio?: number;
      variableBitrate: boolean;
      maxBitrate: number;
      minBitrate: number;
      averageBitrate: number;
    } = {
      overall: overallBitrate,
      variableBitrate: Math.random() > 0.3,
      maxBitrate: Math.round(overallBitrate * 1.5),
      minBitrate: Math.round(overallBitrate * 0.3),
      averageBitrate: overallBitrate,
    };

    if (type === 'video') {
      result.video = Math.round(overallBitrate * 0.85); // ~85% video
      result.audio = Math.round(overallBitrate * 0.15); // ~15% audio
    } else if (type === 'audio') {
      result.audio = overallBitrate;
    }

    return result;
  }

  /**
   * Get color profile information
   */
  public getColorProfile(fileId: string): ColorProfile {
    const cached = this.colorProfileCache.get(fileId);
    if (cached) return cached;

    const profile: ColorProfile = {
      space: this.randomChoice(['sRGB', 'Adobe RGB', 'DCI-P3', 'Rec.2020', 'ProPhoto RGB']),
      profile: this.randomChoice(['ICC v4', 'ICC v2', 'Embedded', 'None']),
      depth: this.randomChoice([8, 10, 12, 16]),
      hasAlpha: Math.random() > 0.7,
      isHDR: Math.random() > 0.8,
      gamut: this.randomChoice(['Standard', 'Wide', 'Ultra-wide']),
    };

    this.colorProfileCache.set(fileId, profile);
    return profile;
  }

  /**
   * Extract comprehensive metadata
   */
  public extractAll(
    fileId: string,
    type: MediaType,
    options: ExtractionOptions & {
      size?: number;
      width?: number;
      height?: number;
      duration?: number;
    } = {},
  ): MediaMetadata {
    const cached = this.metadataCache.get(fileId);
    if (cached) return cached;

    const dimensions =
      type === 'image' || type === 'video'
        ? this.getDimensions(fileId, { width: options.width, height: options.height, type })
        : undefined;

    const durationInfo =
      type === 'video' || type === 'audio'
        ? this.getDuration(fileId, { duration: options.duration, type })
        : undefined;

    const codecInfo = this.getCodecInfo(fileId, { mediaType: type });
    const bitrateInfo =
      type === 'video' || type === 'audio'
        ? this.getBitrate(fileId, { size: options.size, duration: options.duration, type })
        : undefined;

    const gps = options.includeGPS !== false ? this.getGPSLocation(fileId) : undefined;
    const exif =
      type === 'image' && options.includeExif !== false ? this.extractExif(fileId) : undefined;
    const colorProfile =
      options.includeColorProfile !== false ? this.getColorProfile(fileId) : undefined;

    const metadata: MediaMetadata = {
      id: fileId,
      type,
      format:
        type === 'image'
          ? this.randomChoice(['jpeg', 'png', 'webp', 'heif'])
          : codecInfo.video?.codec || codecInfo.audio?.codec || 'unknown',
      size: options.size || Math.round(Math.random() * 100 * 1024 * 1024),
      width: dimensions?.width,
      height: dimensions?.height,
      duration: durationInfo?.seconds,
      bitrate: bitrateInfo?.overall,
      framerate: durationInfo?.framerate,
      codec: codecInfo.video?.codec || codecInfo.audio?.codec,
      audioCodec: codecInfo.audio?.codec,
      sampleRate: codecInfo.audio?.sampleRate,
      channels: codecInfo.audio?.channels,
      colorSpace: colorProfile?.space,
      colorProfile: colorProfile?.profile,
      hasAlpha: colorProfile?.hasAlpha,
      orientation: this.randomChoice([1, 3, 6, 8]),
      gps: gps || undefined,
      exif,
    };

    this.metadataCache.set(fileId, metadata);
    return metadata;
  }

  /**
   * Analyze a file's type from its REAL header bytes.
   *
   * The previous implementation ignored the bytes and returned a randomly
   * chosen type. It now matches the supplied buffer against known magic-byte
   * signatures and reports an honest `application/octet-stream` when nothing
   * matches (or when no bytes were supplied) instead of guessing.
   */
  public analyzeFile(_fileId: string, headerBytes?: Uint8Array): FileAnalysis {
    if (headerBytes && headerBytes.length > 0) {
      const match = matchMagicSignature(headerBytes);
      if (match) {
        return {
          mimeType: match.mime,
          extension: match.ext,
          mediaType: match.type,
          isCorrupted: false,
          headerBytes: match.hex,
        };
      }
      return {
        mimeType: 'application/octet-stream',
        extension: 'bin',
        mediaType: 'document',
        isCorrupted: true,
        headerBytes: toHexPrefix(headerBytes, 8),
      };
    }

    return {
      mimeType: 'application/octet-stream',
      extension: 'bin',
      mediaType: 'document',
      isCorrupted: false,
      headerBytes: '',
    };
  }

  /**
   * Clear metadata cache
   */
  public clearCache(): void {
    this.metadataCache.clear();
    this.exifCache.clear();
    this.colorProfileCache.clear();
  }

  /**
   * Get cache size
   */
  public getCacheSize(): number {
    return this.metadataCache.size + this.exifCache.size + this.colorProfileCache.size;
  }

  // ---- Private Methods ----

  private randomChoice<T>(options: T[]): T {
    return options[Math.floor(Math.random() * options.length)]!;
  }
}
