// ============================================================================
// Moderation Package - Type Definitions
// Comprehensive types for content moderation, trust scoring, and appeals
// ============================================================================

import { z } from 'zod';

/** Content safety categories */
export type ContentCategory =
  | 'safe'
  | 'nsfw'
  | 'violence'
  | 'hate_speech'
  | 'spam'
  | 'harassment'
  | 'self_harm'
  | 'misinformation'
  | 'copyright'
  | 'illegal'
  | 'drugs'
  | 'weapons'
  | 'profanity';

/** Content types that can be moderated */
export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'link' | 'embed';

/** Actions that can be taken on content */
export type ModerationAction =
  | 'approve'
  | 'flag'
  | 'remove'
  | 'restrict'
  | 'ban'
  | 'warn'
  | 'shadow_ban'
  | 'age_restrict'
  | 'mute';

/** Trust levels for users */
export type TrustLevel = 'new' | 'low' | 'medium' | 'high' | 'verified' | 'trusted_creator';

/** Report status lifecycle */
export type ReportStatus =
  | 'open'
  | 'assigned'
  | 'under_review'
  | 'resolved'
  | 'dismissed'
  | 'escalated';

/** Appeal status lifecycle */
export type AppealStatus =
  | 'submitted'
  | 'auto_reviewing'
  | 'human_review'
  | 'approved'
  | 'denied'
  | 'escalated';

/** Report categories */
export type ReportCategory =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nsfw'
  | 'impersonation'
  | 'copyright'
  | 'misinformation'
  | 'self_harm'
  | 'other';

/** Queue priority levels */
export type QueuePriority = 'critical' | 'high' | 'medium' | 'low';

/** Rule condition operators */
export type RuleOperator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'matches'
  | 'in'
  | 'not_in';

/** Severity levels for policy decisions */
export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** Moderation result from classifiers */
export interface ModerationResult {
  id: string;
  contentId: string;
  contentType: ContentType;
  categories: CategoryScore[];
  overallScore: number;
  action: ModerationAction;
  confidence: number;
  automated: boolean;
  reviewedBy?: string;
  reviewedAt?: number;
  flags: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

/** Score for a specific content category */
export interface CategoryScore {
  category: ContentCategory;
  score: number;
  confidence: number;
  detected: boolean;
  evidence?: string[];
}

/** Confidence score with reasoning */
export interface ConfidenceScore {
  value: number;
  factors: { name: string; weight: number; score: number }[];
  explanation: string;
}

/** User report */
export interface Report {
  id: string;
  reporterId: string;
  targetContentId: string;
  targetUserId: string;
  category: ReportCategory;
  description: string;
  evidence: string[];
  status: ReportStatus;
  priority: QueuePriority;
  assignedTo?: string;
  resolution?: string;
  actionTaken?: ModerationAction;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

/** Appeal submission */
export interface Appeal {
  id: string;
  userId: string;
  contentId: string;
  originalAction: ModerationAction;
  reason: string;
  evidence: string[];
  status: AppealStatus;
  reviewerId?: string;
  decision?: 'upheld' | 'overturned' | 'modified';
  decisionReason?: string;
  newAction?: ModerationAction;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

/** Automated rule definition */
export interface AutoRule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  action: ModerationAction;
  enabled: boolean;
  priority: number;
  cooldownMs: number;
  maxExecutionsPerHour: number;
  executionCount: number;
  lastExecutedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Rule condition */
export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: unknown;
  weight: number;
}

/** Queue item for moderator review */
export interface QueueItem {
  id: string;
  contentId: string;
  contentType: ContentType;
  contentPreview: string;
  priority: QueuePriority;
  category: ContentCategory;
  autoScore: number;
  reportCount: number;
  assignedTo?: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
}

/** Trust score record */
export interface TrustScore {
  userId: string;
  score: number;
  level: TrustLevel;
  factors: TrustFactor[];
  lastCalculated: number;
  history: { score: number; timestamp: number; reason: string }[];
}

/** Trust factor component */
export interface TrustFactor {
  name: string;
  weight: number;
  value: number;
  maxValue: number;
  description: string;
}

/** Moderation config */
export interface ModerationConfig {
  autoRemoveThreshold: number;
  autoFlagThreshold: number;
  requireHumanReview: boolean;
  maxReportsBeforeAction: number;
  appealWindowDays: number;
  trustScoreDecayRate: number;
}

/** Image metadata for moderation */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  hash: string;
  fileSize: number;
  hasExif: boolean;
  hasWatermark: boolean;
}

/** Video moderation timeline entry */
export interface TimelineFlag {
  timestamp: number;
  duration: number;
  category: ContentCategory;
  confidence: number;
  frameIndex: number;
  description: string;
}

/** Action log entry */
export interface ActionLogEntry {
  id: string;
  ruleId: string;
  targetUserId: string;
  targetContentId?: string;
  action: ModerationAction;
  reason: string;
  automated: boolean;
  reversible: boolean;
  reversedAt?: number;
  createdAt: number;
}

// ============================================================================
// ML-based Moderation Types
// ============================================================================

/** Text moderation category result from ML API */
export interface TextModerationCategoryResult {
  flagged: boolean;
  score: number;
}

/** Text moderation response from ML API */
export interface TextModerationResponse {
  hate: TextModerationCategoryResult;
  harassment: TextModerationCategoryResult;
  selfHarm: TextModerationCategoryResult;
  sexual: TextModerationCategoryResult;
  violence: TextModerationCategoryResult;
  sexualMinors?: TextModerationCategoryResult;
  threatOfViolence?: TextModerationCategoryResult;
  spam?: TextModerationCategoryResult;
}

/** Full moderation score card with all 7 required categories (Phase 20) */
export interface ModerationScoreCard {
  toxicity: number;
  hate: number;
  harassment: number;
  sexualMinor: number;
  violenceExplicit: number;
  selfHarm: number;
  spam: number;
}

/** API client interface for text moderation */
export interface ModerationAPIClient {
  moderateText(input: string): Promise<TextModerationResponse>;
}

/** Image moderation category result from ML API */
export interface ImageModerationCategoryResult {
  flagged: boolean;
  score: number;
}

/** Image moderation response from ML API */
export interface ImageModerationResponse {
  nsfw: ImageModerationCategoryResult;
  violence: ImageModerationCategoryResult;
  hateSymbols: ImageModerationCategoryResult;
  selfHarm: ImageModerationCategoryResult;
}

/** Input for image moderation */
export interface ImageModerationInput {
  url?: string;
  base64?: string;
}

/** API client interface for image moderation */
export interface ImageModerationAPIClient {
  moderateImage(input: ImageModerationInput): Promise<ImageModerationResponse>;
}

/** Policy configuration for an app */
export interface PolicyConfig {
  appId: string;
  rules: PolicyRule[];
}

/** A single policy rule */
export interface PolicyRule {
  category: ContentCategory;
  threshold: number;
  action: ModerationAction;
  severity: Severity;
}

/** Decision made by the policy engine */
export interface PolicyDecision {
  action: ModerationAction;
  severity: Severity;
  matchedRules: PolicyRule[];
  confidence: number;
}

/** Moderator role for appeal handling */
export type ModeratorRole = 'moderator' | 'senior_moderator' | 'legal';

/** Appeal record - Zod validated */
export const AppealRecordSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  userId: z.string(),
  originalAction: z.enum([
    'approve',
    'flag',
    'remove',
    'restrict',
    'ban',
    'warn',
    'shadow_ban',
    'age_restrict',
    'mute',
  ]),
  reason: z.string(),
  evidence: z.array(z.string()),
  status: z.enum([
    'submitted',
    'auto_reviewing',
    'human_review',
    'approved',
    'denied',
    'escalated',
  ]),
  source: z.enum(['automated', 'user_initiated']),
  assignedTo: z.string().optional(),
  resolution: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  slaDeadline: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  resolvedAt: z.number().optional(),
});

export type AppealRecord = z.infer<typeof AppealRecordSchema>;

/** Transparency report data */
export interface TransparencyReport {
  startDate: number;
  endDate: number;
  totalActions: number;
  actionsByCategory: Record<string, number>;
  appealStats: {
    submitted: number;
    approved: number;
    denied: number;
  };
  avgResolutionTime: number;
  topCategories: { category: string; count: number }[];
}

/** CSAM matcher interface */
export interface CSAMMatcherInterface {
  checkHash(hash: string): Promise<{ matched: boolean; reportId?: string }>;
  reportMatch(params: { hash: string; source: string }): Promise<void>;
}

// ============================================================================
// CSAM Hash Provider Types (Phase 20)
// ============================================================================

/** Interface for CSAM hash-matching providers (PhotoDNA, Thorn Safer, etc.) */
export interface CSAMHashProvider {
  /** Check whether a given SHA-256 hash matches the provider's known CSAM database */
  checkHash(hash: string): Promise<CSAMHashCheckResult>;
  /** Report a confirmed match to the provider for audit/legal purposes */
  reportMatch(params: { hash: string; source: string; timestamp: number }): Promise<void>;
  /** Get the name of this provider for logging/reporting */
  getProviderName(): string;
}

/** Result of a hash check against a CSAM provider */
export interface CSAMHashCheckResult {
  matched: boolean;
  confidence?: number;
  providerResponse?: Record<string, unknown>;
}

/** Report generated when a CSAM match is detected */
export interface CSAMReport {
  hash: string;
  source: string;
  timestamp: number;
  reportId: string;
  providerName: string;
  providerResponse?: Record<string, unknown>;
}

/** Configuration for the CSAM matching service */
export interface CSAMConfig {
  provider: CSAMHashProvider;
  legalContactEmail: string;
  pagingWebhookUrl: string;
  enabledApps: string[];
}

// ============================================================================
// Phase 13 - Abuse Graph, Spam, AI Safety, Ad Policy, Bot Detection, Labels, Audit
// ============================================================================

/** Node in the abuse graph representing a user */
export interface AbuseNode {
  userId: string;
  riskScore: number;
  signals: string[];
  firstSeen: number;
  lastSeen: number;
}

/** Edge in the abuse graph representing a relationship */
export interface AbuseEdge {
  fromUserId: string;
  toUserId: string;
  type: 'shared_ip' | 'shared_device' | 'coordinated_activity' | 'follow_pattern' | 'same_content';
  weight: number;
  createdAt: number;
}

/** Detected cluster of abusive accounts */
export interface AbuseCluster {
  id: string;
  memberIds: string[];
  riskScore: number;
  signals: string[];
  detectedAt: number;
}

/** Types of spam signals */
export type SpamSignalType =
  | 'rate_limit'
  | 'duplicate_content'
  | 'link_spam'
  | 'new_account_burst'
  | 'keyword_spam';

/** Individual spam signal */
export interface SpamSignal {
  type: SpamSignalType;
  confidence: number;
  description: string;
}

/** Spam verdict */
export type SpamVerdict = 'clean' | 'suspicious' | 'spam';

/** Result of a spam check */
export interface SpamCheckResult {
  verdict: SpamVerdict;
  confidence: number;
  signals: SpamSignal[];
}

/** AI output safety issue types */
export interface AIOutputSafetyIssue {
  type: 'pii_leak' | 'harmful_content' | 'unlabeled_ai' | 'low_confidence' | 'prohibited_topic';
  description: string;
  severity: Severity;
}

/** Result of AI output safety check */
export interface AIOutputSafetyResult {
  safe: boolean;
  issues: AIOutputSafetyIssue[];
  labelApplied: boolean;
  checkedAt: number;
}

/** Ad policy violation */
export interface AdPolicyViolation {
  type: 'prohibited_category' | 'misleading_claim' | 'targeting_minors' | 'creative_violation';
  description: string;
  severity: Severity;
}

/** Result of ad policy check */
export interface AdPolicyCheckResult {
  decision: 'approved' | 'rejected' | 'needs_review';
  violations: AdPolicyViolation[];
  checkedAt: number;
}

/** Bot classification levels */
export type BotClassification = 'human' | 'likely_human' | 'suspicious' | 'likely_bot' | 'bot';

/** Individual bot detection signal */
export interface BotSignal {
  type: string;
  score: number;
  description: string;
}

/** Result of bot detection check */
export interface BotCheckResult {
  userId: string;
  score: number;
  classification: BotClassification;
  signals: BotSignal[];
  checkedAt: number;
}

/** Content label types */
export type ContentLabelType =
  | 'ai_generated'
  | 'mature_content'
  | 'graphic_violence'
  | 'sensitive_topic'
  | 'sponsored'
  | 'political';

/** Record of a content label */
export interface ContentLabelRecord {
  id: string;
  contentId: string;
  label: ContentLabelType;
  appliedBy: string;
  appliedAt: number;
}

/** Content warning configuration */
export interface ContentWarningConfig {
  label: ContentLabelType;
  requiresInterstitial: boolean;
  warningMessage: string;
}

/** Safety event types for audit logging */
export type SafetyEventType =
  | 'content_flagged'
  | 'content_removed'
  | 'user_warned'
  | 'user_banned'
  | 'appeal_submitted'
  | 'appeal_resolved'
  | 'policy_changed'
  | 'manual_override'
  | 'bot_detected'
  | 'spam_blocked'
  | 'abuse_cluster_detected';

/** Safety audit log entry */
export interface SafetyAuditEntry {
  id: string;
  eventType: SafetyEventType;
  actor: string;
  targetUserId?: string;
  targetContentId?: string;
  action: string;
  reason: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// Video & Live Stream Moderation Types (Phase 20)
// ============================================================================

/** Result of a keyframe extraction operation */
export interface KeyframeResult {
  timestamp: number;
  framePath?: string;
  buffer?: Buffer;
}

/** A single segment within a transcription result */
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

/** Result from audio transcription */
export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  duration: number;
  language?: string;
}

/** Events emitted by the LiveModerator */
export type LiveModerationEventType = 'flag' | 'disconnect' | 'ban';

/** Event payload emitted by the LiveModerator */
export interface LiveModerationEvent {
  type: LiveModerationEventType;
  sessionId: string;
  userId: string;
  reason: string;
  timestamp: number;
  violationCount: number;
}

/** Session state tracked by the LiveModerator */
export interface LiveModerationSession {
  sessionId: string;
  userId: string;
  startedAt: number;
  violationCount: number;
  lastFlagAt?: number;
  disconnected: boolean;
  banned: boolean;
}

/** Configuration for stream moderation */
export interface StreamModerationConfig {
  frameSampleIntervalMs: number;
  violationThresholdForDisconnect: number;
  violationThresholdForBan: number;
  banDurationMs: number;
  profanityKeywords: string[];
}

/** Interface for Whisper-compatible transcription providers */
export interface WhisperProvider {
  transcribe(audio: Buffer | string): Promise<TranscriptionResult>;
}

/** Interface for frame extraction backends (DI pattern) */
export interface FrameExtractorBackend {
  extractFrames(input: string | Buffer, timestamps: number[]): Promise<KeyframeResult[]>;
}

// ============================================================================
// Account Integrity & Verification Types (Phase 20)
// ============================================================================

/** SMS provider interface for phone verification */
export interface SMSProvider {
  /** Send an SMS message to a phone number */
  send(phoneNumber: string, message: string): Promise<SMSSendResult>;
  /** Get provider name for logging */
  getProviderName(): string;
}

/** Result of sending an SMS */
export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Result of phone verification */
export interface PhoneVerificationResult {
  success: boolean;
  error?: string;
  messageId?: string;
  retryAfter?: number;
}

/** Result of email validation */
export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
  disposable: boolean;
  mxValid: boolean;
}

/** Raw browser signals for device fingerprinting */
export interface DeviceSignals {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  canvasHash?: string;
  webglHash?: string;
  installedFontsHash?: string;
}

/** Computed device fingerprint */
export interface DeviceFingerprint {
  deviceId: string;
  signals: DeviceSignals;
  createdAt: number;
}

/** Result of a sybil check */
export interface SybilCheckResult {
  isSybil: boolean;
  confidence: number;
  linkedAccounts: string[];
}

/** Behavioral signals for risk analysis */
export interface BehavioralSignals {
  accountAgeDays: number;
  typingSpeedWpm?: number;
  mouseEntropy?: number;
  sessionCount: number;
  avgSessionDurationMs?: number;
}

/** Behavioral risk score result */
export interface BehavioralRiskScore {
  score: number;
  factors: BehavioralRiskFactor[];
  classification: 'low' | 'medium' | 'high' | 'critical';
}

/** Individual behavioral risk factor */
export interface BehavioralRiskFactor {
  name: string;
  score: number;
  description: string;
}

/** Human-likeness assessment */
export interface HumanLikenessResult {
  confidence: number;
  factors: { name: string; passed: boolean; detail: string }[];
}

/** Age groups for age gating */
export type AgeGroup = 'under13' | 'under16' | 'under18' | 'adult';

/** Age verification result */
export interface AgeVerificationResult {
  ageGroup: AgeGroup;
  restrictions: string[];
}

/** Step-up verification methods */
export type StepUpMethod = 'id_upload' | 'parental_consent' | 'phone';

/** Step-up verification requirement */
export interface StepUpVerification {
  required: boolean;
  method: StepUpMethod;
}

/** Age restriction record */
export interface AgeRestriction {
  feature: string;
  minAgeGroup: AgeGroup;
  requiresStepUp: boolean;
  stepUpMethod?: StepUpMethod;
}
