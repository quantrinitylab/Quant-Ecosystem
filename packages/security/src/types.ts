// ============================================================================
// Security Package - Type Definitions
// ============================================================================

/** Rate limiting configuration */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstLimit: number;
  keyPrefix: string;
  skipFailedRequests: boolean;
  enableSliding: boolean;
  blockDuration: number;
}

/** Sliding window entry for rate tracking */
export interface SlidingWindowEntry {
  timestamp: number;
  weight: number;
  endpoint: string;
  ip: string;
  userId?: string;
}

/** Rate limit result */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  limit: number;
  current: number;
}

/** DDoS protection configuration */
export interface DDoSConfig {
  thresholdRps: number;
  blockDurationMs: number;
  reputationDecay: number;
  challengeThreshold: number;
  maxTrackedIPs: number;
  patternWindowMs: number;
  geoBlockEnabled: boolean;
  blockedCountries: string[];
}

/** IP reputation score tracking */
export interface IPReputation {
  ip: string;
  score: number;
  requestCount: number;
  firstSeen: number;
  lastSeen: number;
  blocked: boolean;
  blockExpiry: number;
  challengesPassed: number;
  challengesFailed: number;
  suspiciousPatterns: string[];
  country?: string;
}

/** Challenge-response result */
export interface ChallengeResult {
  challengeId: string;
  type: 'proof-of-work' | 'captcha' | 'javascript';
  difficulty: number;
  issued: number;
  expiry: number;
  solved: boolean;
  solution?: string;
  expectedAnswer?: string;
}

/** CSRF token data */
export interface CSRFToken {
  token: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  hmac: string;
}

/** CSRF configuration */
export interface CSRFConfig {
  tokenLength: number;
  tokenExpiry: number;
  cookieName: string;
  headerName: string;
  secretKey: string;
  sameSite: 'strict' | 'lax' | 'none';
  secure: boolean;
}

/** XSS sanitization configuration */
export interface XSSConfig {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  allowedProtocols: string[];
  stripComments: boolean;
  encodeEntities: boolean;
  maxInputLength: number;
  blockDataUrls: boolean;
}

/** Sanitization result */
export interface SanitizeResult {
  clean: string;
  original: string;
  modified: boolean;
  threats: XSSThreat[];
  score: number;
}

/** XSS threat detection */
export interface XSSThreat {
  type: string;
  pattern: string;
  position: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** SQL injection protection configuration */
export interface SQLInjectionConfig {
  strictMode: boolean;
  logAttempts: boolean;
  maxQueryLength: number;
  allowedOperators: string[];
  blockedKeywords: string[];
}

/** Parameterized query representation */
export interface ParameterizedQuery {
  sql: string;
  params: unknown[];
  hash: string;
  safe: boolean;
  originalInput: string;
}

/** SQL injection detection result */
export interface SQLInjectionResult {
  isSafe: boolean;
  threats: SQLThreat[];
  sanitized: string;
  confidence: number;
}

/** SQL threat info */
export interface SQLThreat {
  type: string;
  pattern: string;
  position: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/** Validation schema definition */
export interface ValidationSchema {
  fields: Record<string, ValidationRule>;
  strict: boolean;
  allowUnknown: boolean;
  abortEarly: boolean;
}

/** Individual field validation rule */
export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'email' | 'url' | 'date' | 'uuid';
  required: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: unknown[];
  items?: ValidationRule;
  properties?: Record<string, ValidationRule>;
  custom?: string;
  message?: string;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitized: Record<string, unknown>;
  fieldCount: number;
}

/** Validation error detail */
export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  value: unknown;
}

/** Encryption service configuration */
export interface EncryptionConfig {
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
  keySize: number;
  ivLength: number;
  tagLength: number;
  iterations: number;
  saltLength: number;
  keyRotationInterval: number;
}

/** RSA key pair */
export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
  createdAt: number;
  expiresAt: number;
  algorithm: string;
  keySize: number;
}

/** Encrypted data envelope */
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  keyId: string;
  algorithm: string;
  version: number;
  timestamp: number;
}

/** Key derivation result */
export interface DerivedKey {
  key: string;
  salt: string;
  iterations: number;
  algorithm: string;
}

/** Password hash result */
export interface PasswordHashResult {
  hash: string;
  salt: string;
  algorithm: string;
  version: number;
  params: Argon2Params;
  createdAt: number;
}

/** Argon2 parameters */
export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
}

/** Password strength assessment */
export interface PasswordStrength {
  score: number;
  level: 'very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong';
  feedback: string[];
  entropy: number;
  crackTime: string;
}

/** API key definition */
export interface APIKey {
  id: string;
  key: string;
  prefix: string;
  hash: string;
  name: string;
  scopes: APIKeyScope[];
  createdAt: number;
  expiresAt: number;
  lastUsed: number;
  usageCount: number;
  rateLimit: number;
  active: boolean;
  metadata: Record<string, string>;
}

/** API key scope */
export interface APIKeyScope {
  resource: string;
  actions: string[];
  conditions?: Record<string, string>;
}

/** API key validation result */
export interface APIKeyValidation {
  valid: boolean;
  key?: APIKey;
  reason?: string;
  remainingUses?: number;
}

/** OAuth2 security configuration */
export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  allowedScopes: string[];
  tokenExpiry: number;
  refreshTokenExpiry: number;
  requirePKCE: boolean;
  requireState: boolean;
}

/** PKCE challenge pair */
export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256' | 'plain';
  createdAt: number;
  expiresAt: number;
}

/** OAuth2 authorization request */
export interface OAuth2AuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  nonce: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  responseType: string;
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: AuditActor;
  action: string;
  resource: string;
  resourceId: string;
  outcome: 'success' | 'failure' | 'error';
  details: Record<string, unknown>;
  ip: string;
  userAgent: string;
  hash: string;
  previousHash: string;
}

/** Audit actor information */
export interface AuditActor {
  id: string;
  type: 'user' | 'service' | 'system' | 'admin';
  name: string;
  email?: string;
}

/** GDPR data request */
export interface GDPRRequest {
  id: string;
  userId: string;
  type: 'export' | 'deletion' | 'rectification' | 'portability';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: number;
  completedAt?: number;
  dataCategories: string[];
}

/** GDPR export data */
export interface GDPRExportData {
  userId: string;
  exportDate: number;
  categories: Record<string, unknown[]>;
  metadata: Record<string, string>;
  format: 'json' | 'csv';
}

/** Consent record */
export interface ConsentRecord {
  userId: string;
  purpose: string;
  granted: boolean;
  timestamp: number;
  expiresAt?: number;
  version: string;
  source: string;
  withdrawnAt?: number;
}

/** Retention policy */
export interface RetentionPolicy {
  category: string;
  retentionDays: number;
  legalBasis: string;
  autoDelete: boolean;
  notifyBeforeDays: number;
}

/** Geographic location from IP */
export interface GeoLocation {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;
  riskScore: number;
}

/** Honeypot detection configuration */
export interface HoneypotConfig {
  hiddenFields: string[];
  minSubmitTime: number;
  maxSubmitTime: number;
  trapEndpoints: string[];
  jsChallenge: boolean;
  scoringThreshold: number;
}

/** Bot detection result */
export interface BotDetectionResult {
  isBot: boolean;
  score: number;
  signals: BotSignal[];
  action: 'allow' | 'challenge' | 'block';
}

/** Bot signal indicator */
export interface BotSignal {
  type: string;
  weight: number;
  description: string;
}

/** Session security configuration */
export interface SessionConfig {
  maxConcurrent: number;
  idleTimeout: number;
  absoluteTimeout: number;
  rotateOnAuth: boolean;
  secureCookie: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  fingerprintBinding: boolean;
  fingerprintSecret: string;
}

/** Secure session data */
export interface SecureSession {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  rotatedFrom?: string;
  fingerprint: string;
  ip: string;
  userAgent: string;
  privilegeLevel: number;
}

/** CSP directive types */
export interface CSPDirective {
  name: string;
  values: string[];
  nonces?: string[];
  hashes?: string[];
}

/** Complete CSP policy */
export interface CSPPolicy {
  directives: CSPDirective[];
  reportOnly: boolean;
  reportUri?: string;
  nonce: string;
  generated: string;
}

// ============================================================================
// Threat Modeling Types
// ============================================================================

/** STRIDE threat category */
export type ThreatCategory =
  | 'Spoofing'
  | 'Tampering'
  | 'Repudiation'
  | 'InformationDisclosure'
  | 'DenialOfService'
  | 'ElevationOfPrivilege';

/** A single identified threat */
export interface Threat {
  id: string;
  category: ThreatCategory;
  title: string;
  description: string;
  affectedAsset: string;
  affectedInterface: string;
  riskAssessment?: RiskAssessment;
  mitigations?: string[];
}

/** Risk assessment for a threat */
export interface RiskAssessment {
  severity: 'low' | 'medium' | 'high' | 'critical';
  likelihood: number;
  impact: number;
  score: number;
}

/** Service model for threat analysis */
export interface ServiceModel {
  name: string;
  assets: string[];
  interfaces: ServiceInterface[];
}

/** Service interface for threat modeling */
export interface ServiceInterface {
  name: string;
  type: 'api' | 'event' | 'database' | 'external' | 'internal';
  protocol: string;
  authenticated: boolean;
  encrypted: boolean;
}

// ============================================================================
// Pen Test Scanner Types
// ============================================================================

/** Pen test finding */
export interface PenTestFinding {
  id: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  endpoint: string;
  evidence: string;
  remediation: string;
  owaspCategory: string;
}

/** Pen test report */
export interface PenTestReport {
  scanId: string;
  timestamp: number;
  target: string;
  findings: PenTestFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ============================================================================
// API Fuzzer Types
// ============================================================================

/** Fuzz result */
export interface FuzzResult {
  endpoint: string;
  iteration: number;
  payload: unknown;
  statusCode: number;
  responseTime: number;
  anomaly: boolean;
  anomalyReason?: string;
}

/** Fuzz mutation type */
export type FuzzMutation =
  | 'sql_injection'
  | 'xss'
  | 'boundary'
  | 'null_bytes'
  | 'unicode'
  | 'overflow'
  | 'format_string';

// ============================================================================
// Secret Manager Types
// ============================================================================

/** Secret vault adapter interface */
export interface SecretVaultAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/** Secret access log entry */
export interface SecretAccessLog {
  key: string;
  action: 'read' | 'write' | 'rotate' | 'delete';
  actor: string;
  timestamp: number;
  ip?: string;
}

// ============================================================================
// Container Security Types
// ============================================================================

/** Container validation result */
export interface ContainerValidation {
  valid: boolean;
  issues: ContainerIssue[];
  score: number;
}

/** Container security issue */
export interface ContainerIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  rule: string;
  description: string;
  line?: number;
  remediation: string;
}

/** Trivy scan result (simplified) */
export interface TrivyScanResult {
  imageRef: string;
  vulnerabilities: TrivyVulnerability[];
  scanTime: number;
}

/** Trivy vulnerability */
export interface TrivyVulnerability {
  id: string;
  package: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  installedVersion: string;
  fixedVersion?: string;
  title: string;
}

// ============================================================================
// mTLS Types
// ============================================================================

/** Certificate configuration */
export interface CertificateConfig {
  service: string;
  commonName: string;
  sans: string[];
  ca: string;
  validityDays: number;
  keySize: number;
  algorithm: string;
}

/** Cert chain validation result */
export interface CertChainValidation {
  valid: boolean;
  chain: string[];
  expiry: number;
  issuer: string;
  errors: string[];
}

// ============================================================================
// WAF Types
// ============================================================================

/** WAF decision */
export interface WAFDecision {
  action: 'allow' | 'block' | 'challenge';
  ruleId?: string;
  reason?: string;
  timestamp: number;
}

/** WAF rule */
export interface WAFRule {
  id: string;
  name: string;
  pattern: string;
  target: 'uri' | 'body' | 'headers' | 'query' | 'cookies';
  action: 'block' | 'challenge' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

/** WAF request representation */
export interface WAFRequest {
  uri: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
  cookies?: Record<string, string>;
  ip: string;
}

/** Blocked request stats */
export interface BlockedRequestStats {
  total: number;
  byRule: Record<string, number>;
  byIP: Record<string, number>;
  timeRange: { start: number; end: number };
}

// ============================================================================
// Compliance Framework Types
// ============================================================================

/** Compliance control */
export interface ComplianceControl {
  id: string;
  framework: string;
  category: string;
  title: string;
  description: string;
  status: 'pass' | 'fail' | 'partial' | 'not_applicable';
  evidence?: string;
  remediation?: string;
}

/** Compliance audit result */
export interface ComplianceAuditResult {
  framework: string;
  auditDate: number;
  controls: ComplianceControl[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    partial: number;
    notApplicable: number;
  };
  score: number;
}

/** Supported compliance framework type */
export type ComplianceFrameworkType = 'GDPR' | 'CCPA' | 'PCI-DSS' | 'SOC2' | 'DPDP' | 'COPPA';

/** Data Protection Impact Assessment */
export interface DPIAReport {
  service: string;
  dataFlows: DataFlow[];
  risks: DPIARisk[];
  mitigations: string[];
  necessity: string;
  proportionality: string;
  generatedAt: number;
}

/** Data flow for DPIA */
export interface DataFlow {
  source: string;
  destination: string;
  dataType: string;
  purpose: string;
  legalBasis: string;
  retention: string;
}

/** DPIA risk */
export interface DPIARisk {
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  residualRisk: 'low' | 'medium' | 'high';
}

/** SBOM entry (CycloneDX) */
export interface SBOMEntry {
  type: 'library' | 'framework' | 'application' | 'container';
  name: string;
  version: string;
  purl?: string;
  license?: string;
  hashes?: { algorithm: string; value: string }[];
}

/** SBOM output */
export interface SBOMOutput {
  bomFormat: 'CycloneDX';
  specVersion: string;
  serialNumber: string;
  version: number;
  components: SBOMEntry[];
  generatedAt: number;
}

// ============================================================================
// Trust & Safety Types
// ============================================================================

export type { SybilCluster, AbuseReport } from './core/abuse-graph';

export type { ReputationFactors, ReputationScore } from './core/reputation';

export type { SpamInput, SpamResult, SpamFeature, TrainingSample } from './core/anti-spam';

export type { RateLimitRule, RateLimitCheckResult } from './core/configurable-rate-limiter';

export type { RateLimitStore } from './core/configurable-rate-limiter';

export type { ChallengeDecision } from './core/captcha-challenger';
