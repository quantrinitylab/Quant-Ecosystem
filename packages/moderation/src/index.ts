// ============================================================================
// Moderation Package - Barrel Export
// ============================================================================

export * from './types';
export { TextClassifier } from './services/text-classifier';
export { ImageClassifier } from './services/image-classifier';
export {
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
export type { Reviewer } from './services/appeal-workflow';
export { AppealsQueue } from './services/appeals-queue';
export type { QueueStats, ReviewerWorkload } from './services/appeals-queue';
export { TransparencyReportGenerator } from './services/transparency-report';
export { SafetyMicrofeatures } from './services/safety-microfeatures';
export type {
  OneTapAction,
  OneTapActionResult,
  UsageMetrics,
  DistressResult,
  MassUnfollowResult,
  SelfHarmRedirectResult,
  CrisisHotline,
} from './services/safety-microfeatures';
export { GroomingPatternDetector } from './services/grooming-detector';
export type { GroomingDetectionResult, ConversationMessage } from './services/grooming-detector';
export { ContentClassifier } from './services/content-classifier';
export { TextModerator } from './services/text-moderator';
export { ImageModerator } from './services/image-moderator';
export { VideoModerator } from './services/video-moderator';
export type {
  VideoAnalysisBackend,
  VideoFrameSample,
  VideoAudioAnalysis,
} from './services/video-moderator';
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
  FailClosedFrameExtractorBackend,
} from './services/keyframe-extractor';
export {
  AudioTranscriber,
  OpenAIWhisperProvider,
  MockWhisperProvider,
  createWhisperProviderFromEnv,
} from './services/audio-transcriber';
export { LiveModerator } from './services/live-moderator';
export {
  PhoneVerificationService,
  TwilioSMSProvider,
  MSG91SMSProvider,
} from './services/phone-verification';
export { EmailVerificationService } from './services/email-verification';
export { DeviceFingerprintService } from './services/device-fingerprint';
export { BehavioralSignalAnalyzer } from './services/behavioral-signals';
export { AgeGateService } from './services/age-gate';

export { ModerationEngine } from './core/moderation-engine';
export type { ContentItem } from './models/content-item';
export type { ModerationResult as SimpleModerationResult } from './models/moderation-result';

import { ModerationEngine } from './core/moderation-engine';
export const moderationEngine = new ModerationEngine();
