// ============================================================================
// Media Package - Barrel Export
// ============================================================================

export { ImageProcessor } from './services/image-processor.js';
export {
  VideoTranscoder,
  TranscodeOptionsSchema,
  TranscodeProfileSchema,
} from './services/video-transcoder.js';
export type {
  TranscodeOptions,
  TranscodeInput,
  TranscodeResult,
} from './services/video-transcoder.js';
export { AudioProcessor } from './services/audio-processor.js';
export { UploadManager } from './services/upload-manager.js';
export { CDNService, CDNConfigSchema } from './services/cdn-service.js';
export type { CDNConfig, InvalidationResult } from './services/cdn-service.js';
export { MetadataExtractor } from './services/metadata-extractor.js';

export { SharedMediaPickerService } from './shared-media-picker.js';
export type { MediaItem, PickerOptions, StorageInfo } from './shared-media-picker.js';

export type {
  MediaType,
  ImageFormat,
  VideoCodec,
  AudioCodec,
  ContainerFormat,
  ProcessingOptions,
  TranscodeProfile,
  ImageFilter,
  ImageFilterConfig,
  UploadChunk,
  UploadSession,
  UploadStatus,
  MediaMetadata,
  GPSCoordinates,
  ExifData,
  CDNConfig as LegacyCDNConfig,
  CDNEdge,
  ThumbnailOptions,
  WaveformData,
  StreamingManifest,
  StreamVariant,
  StreamSegment,
  ProcessingJob,
  AudioEffect,
  AudioEffectConfig,
  ResponsiveImageSet,
} from './types.js';
