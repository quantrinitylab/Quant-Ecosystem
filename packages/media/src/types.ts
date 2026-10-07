// ============================================================================
// Media Package - Type Definitions
// ============================================================================

/** Media content types */
export type MediaType = 'image' | 'video' | 'audio' | 'document';

/** Image format types */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg' | 'tiff' | 'bmp';

/** Video codec types */
export type VideoCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1';

/** Audio codec types */
export type AudioCodec = 'aac' | 'mp3' | 'opus' | 'vorbis' | 'flac' | 'wav' | 'pcm';

/** Container format */
export type ContainerFormat = 'mp4' | 'webm' | 'mkv' | 'avi' | 'mov' | 'ogg' | 'ts';

/** Image processing options */
export interface ProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'entropy' | 'attention';
  background?: string;
  blur?: number;
  sharpen?: number;
  rotate?: number;
  flip?: boolean;
  flop?: boolean;
  grayscale?: boolean;
  strip?: boolean;
}

/** Transcode profile for video/audio */
export interface TranscodeProfile {
  id: string;
  name: string;
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  container: ContainerFormat;
  videoBitrate?: number; // kbps
  audioBitrate?: number; // kbps
  width?: number;
  height?: number;
  framerate?: number;
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  crf?: number; // Constant Rate Factor (0-51, lower = better quality)
  sampleRate?: number; // Audio sample rate in Hz
  channels?: number; // Audio channels
}

/** Image filter types */
export type ImageFilter =
  | 'blur'
  | 'sharpen'
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'hue_rotate'
  | 'vignette'
  | 'noise'
  | 'posterize';

/** Image filter with parameters */
export interface ImageFilterConfig {
  type: ImageFilter;
  intensity: number; // 0-100
  params?: Record<string, number>;
}

/** Upload chunk information */
export interface UploadChunk {
  index: number;
  offset: number;
  size: number;
  hash: string;
  data: ArrayBuffer | null;
  uploaded: boolean;
  uploadedAt?: number;
  retries: number;
}

/** Upload session */
export interface UploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number;
  chunks: UploadChunk[];
  status: UploadStatus;
  startedAt: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
  checksum?: string;
}

/** Upload status */
export type UploadStatus = 'initialized' | 'uploading' | 'paused' | 'completing' | 'completed' | 'failed' | 'cancelled';

/** Media metadata */
export interface MediaMetadata {
  id: string;
  type: MediaType;
  format: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  framerate?: number;
  codec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  colorSpace?: string;
  colorProfile?: string;
  hasAlpha?: boolean;
  orientation?: number;
  gps?: GPSCoordinates;
  exif?: ExifData;
  createdAt?: number;
  modifiedAt?: number;
}

/** GPS coordinates */
export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

/** EXIF data */
export interface ExifData {
  make?: string;
  model?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  flash?: boolean;
  whiteBalance?: string;
  dateTime?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  lens?: string;
}

/** CDN configuration */
export interface CDNConfig {
  baseUrl: string;
  edges: CDNEdge[];
  signatureSecret: string;
  signatureExpiry: number; // ms
  cacheDuration: number; // seconds
  allowedOrigins: string[];
  transformations: boolean;
}

/** CDN edge server */
export interface CDNEdge {
  id: string;
  region: string;
  url: string;
  latitude: number;
  longitude: number;
  capacity: number;
  currentLoad: number;
  healthy: boolean;
}

/** Thumbnail generation options */
export interface ThumbnailOptions {
  width: number;
  height: number;
  format?: ImageFormat;
  quality?: number;
  fit?: 'cover' | 'contain';
  timestamp?: number; // For video thumbnails (seconds)
}

/** Waveform visualization data */
export interface WaveformData {
  samples: number[];
  channels: number;
  sampleRate: number;
  duration: number;
  peaks: number[];
  rms: number[];
  bitDepth: number;
}

/** HLS/DASH manifest */
export interface StreamingManifest {
  type: 'hls' | 'dash';
  masterPlaylistUrl: string;
  variants: StreamVariant[];
  duration: number;
  segmentDuration: number;
}

/** Stream variant (resolution/bitrate) */
export interface StreamVariant {
  resolution: string;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  playlistUrl: string;
  segments: StreamSegment[];
}

/** Stream segment */
export interface StreamSegment {
  index: number;
  url: string;
  duration: number;
  byteRange?: { start: number; end: number };
}

/** Processing job status */
export interface ProcessingJob {
  id: string;
  type: 'transcode' | 'thumbnail' | 'waveform' | 'metadata';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  inputFile: string;
  outputFile?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  profile?: TranscodeProfile;
}

/** Audio effect types */
export type AudioEffect =
  | 'normalize'
  | 'fade_in'
  | 'fade_out'
  | 'echo'
  | 'reverb'
  | 'pitch_shift'
  | 'speed'
  | 'noise_reduction'
  | 'compressor'
  | 'equalizer';

/** Audio effect configuration */
export interface AudioEffectConfig {
  type: AudioEffect;
  params: Record<string, number>;
}

/** Responsive image set */
export interface ResponsiveImageSet {
  original: string;
  sizes: Array<{
    width: number;
    height: number;
    url: string;
    format: ImageFormat;
    size: number;
  }>;
  srcSet: string;
  defaultSize: string;
}
