// ============================================================================
// Security Package - Barrel Export
// ============================================================================

export { SlidingWindowRateLimiter } from './core/rate-limiter';
export { DDoSProtector } from './core/ddos-protection';
export { CSRFManager } from './core/csrf-protection';
export { XSSSanitizer } from './core/xss-sanitizer';
export { SQLInjectionGuard } from './core/sql-injection-guard';
export { InputValidator } from './core/input-validator';
export { EncryptionService } from './core/encryption';
export { PasswordHasher } from './core/password-hasher';
export { APIKeyManager } from './core/api-key-manager';
export { OAuth2Security } from './core/oauth2-security';
export { AuditLogger } from './core/audit-logger';
export { PrivacyCompliance } from './core/privacy-compliance';
export { IPGeolocation } from './core/ip-geolocation';
export { HoneypotDetector } from './core/honeypot';
export { SessionSecurity } from './core/session-security';
export { CSPGenerator } from './core/csp-generator';

export { AbuseGraph } from './core/abuse-graph';
export { ReputationService } from './core/reputation';
export { AntiSpamFilter } from './core/anti-spam';
export { ConfigurableRateLimiter, InMemoryRateLimitStore } from './core/configurable-rate-limiter';
export { CaptchaChallengerService } from './core/captcha-challenger';

// Phase 34: Security Hardening + Compliance
export { ThreatModeler } from './core/threat-model';
export { PenTestScanner } from './core/pen-test-scanner';
export { APIFuzzer } from './core/api-fuzzer';
export { SecretManager, InMemoryVaultAdapter } from './core/secret-manager';
export { ContainerSecurityScanner } from './core/container-security';
export { MTLSConfigurator } from './core/mtls-config';
export { WAFRuleEngine } from './core/waf-rules';
export { ComplianceFramework } from './core/compliance-framework';

export type {
  RateLimitConfig,
  SlidingWindowEntry,
  RateLimitResult,
  DDoSConfig,
  IPReputation,
  ChallengeResult,
  CSRFToken,
  CSRFConfig,
  XSSConfig,
  SanitizeResult,
  XSSThreat,
  SQLInjectionConfig,
  ParameterizedQuery,
  SQLInjectionResult,
  SQLThreat,
  ValidationSchema,
  ValidationRule,
  ValidationResult,
  ValidationError,
  EncryptionConfig,
  KeyPair,
  EncryptedData,
  DerivedKey,
  PasswordHashResult,
  Argon2Params,
  PasswordStrength,
  APIKey,
  APIKeyScope,
  APIKeyValidation,
  OAuth2Config,
  PKCEChallenge,
  OAuth2AuthRequest,
  AuditLogEntry,
  AuditActor,
  GDPRRequest,
  GDPRExportData,
  ConsentRecord,
  RetentionPolicy,
  GeoLocation,
  HoneypotConfig,
  BotDetectionResult,
  BotSignal,
  SessionConfig,
  SecureSession,
  CSPDirective,
  CSPPolicy,
  SybilCluster,
  AbuseReport,
  ReputationFactors,
  ReputationScore,
  SpamInput,
  SpamResult,
  SpamFeature,
  TrainingSample,
  RateLimitRule,
  RateLimitCheckResult,
  RateLimitStore,
  ChallengeDecision,
  // Phase 34 types
  ThreatCategory,
  Threat,
  RiskAssessment,
  ServiceModel,
  ServiceInterface,
  PenTestFinding,
  PenTestReport,
  FuzzResult,
  FuzzMutation,
  SecretVaultAdapter,
  SecretAccessLog,
  ContainerValidation,
  ContainerIssue,
  TrivyScanResult,
  TrivyVulnerability,
  CertificateConfig,
  CertChainValidation,
  WAFDecision,
  WAFRule,
  WAFRequest,
  BlockedRequestStats,
  ComplianceControl,
  ComplianceAuditResult,
  ComplianceFrameworkType,
  DPIAReport,
  DataFlow,
  DPIARisk,
  SBOMEntry,
  SBOMOutput,
} from './types';
