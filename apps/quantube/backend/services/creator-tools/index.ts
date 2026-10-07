/**
 * Creator Tools - AI-powered services for content creators
 */
export { AIThumbnailService, GenerateThumbnailsSchema } from './ai-thumbnail.service';
export type {
  ThumbnailOption,
  GenerateThumbnailsInput,
  AIThumbnailConfig,
} from './ai-thumbnail.service';

export {
  AITitleABService,
  GenerateTitlesSchema,
  StartABTestSchema,
  RecordImpressionSchema,
  RecordClickSchema,
} from './ai-title-ab.service';
export type {
  GenerateTitlesInput,
  StartABTestInput,
  ABTestVariant,
  ABTest,
} from './ai-title-ab.service';

export {
  AIClipMakerService,
  AnalyzeVideoSchema,
  GenerateClipsSchema,
} from './ai-clip-maker.service';
export type {
  AnalyzeVideoInput,
  GenerateClipsInput,
  VideoSegment,
  VideoAnalysis,
  Clip,
} from './ai-clip-maker.service';

export {
  AICaptionService,
  TranscribeSchema,
  TranslateSchema,
  ExportCaptionsSchema,
} from './ai-caption.service';
export type {
  TranscribeInput,
  TranslateInput,
  ExportCaptionsInput,
  CaptionSegment,
  TranscriptionResult,
} from './ai-caption.service';
