// ============================================================================
// Moderation Package - Barrel Export
// ============================================================================

export * from './types';
export { TextClassifier } from './services/text-classifier';
export { ImageClassifier } from './services/image-classifier';
export {
  determineAction,
  DEFAULT_CLASSIFIER_THRESHOLDS,
  type ClassifierThresholds,
} from './services/classifier-thresholds';
export { PerceptualHasher } from './services/perceptual-hash';
export { BloomFilter } from './services/bloom-filter';
export { HashRegistry } from './services/hash-registry';
export type { HashCheckResult, HashRegistryStats } from './services/hash-registry';
export { CSAMGuard, CSAMGuardLegacy, CSAMMatchService } from './services/csam-matcher';
export {
  PhotoDNAProvider,
  TestHashProvider,
  NullProvider,
  NCMEC_TEST_HASHES,
} from './services/csam-hash-provider';
export { PolicyEngine, PolicySchema, PolicyRuleSchema } from './services/policy-engine';
export { AppealWorkflow } from './services/appeal-workflow';
export { TransparencyReportGenerator } from './services/transparency-report';
export { ContentClassifier } from './services/content-classifier';
export { TextModerator } from './services/text-moderator';
export { ImageModerator } from './services/image-moderator';
export { VideoModerator } from './services/video-moderator';
export { ReportHandler } from './services/report-handler';
export { AppealService } from './services/appeal-service';
export { AutoActionEngine } from './services/auto-action-engine';
export { TrustScoreService } from './services/trust-score-service';
export { AbuseGraphService } from './services/abuse-graph';
export { SpamDetectionService } from './services/spam-detection';
export { AIOutputSafetyService } from './services/ai-output-safety';
export { AdPolicyEnforcementService } from './services/ad-policy-enforcement';
export { BotDetectionService } from './services/bot-detection';
export { ContentLabelService } from './services/content-labels';
export { SafetyAuditLogService } from './services/safety-audit-log';
export {
  KeyframeExtractor,
  MockFrameExtractorBackend,
  FfmpegFrameExtractorBackend,
} from './services/keyframe-extractor';
export {
  AudioTranscriber,
  OpenAIWhisperProvider,
  MockWhisperProvider,
} from './services/audio-transcriber';
export { LiveModerator } from './services/live-moderator';
