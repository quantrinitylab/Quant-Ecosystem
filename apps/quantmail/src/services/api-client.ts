import type {
  WorkspaceSummary,
  WorkspaceDetail,
  WorkspaceMember,
  WorkspaceInvite,
  WorkspaceRole,
  InviteRole,
  InviteSendResult,
  InvitePreview,
} from '../types/workspace';
// ============================================================================
// QuantMail - Frontend API Client
// ============================================================================

import { browserAuthSession } from './browser-auth-session';
import { browserApiRequest } from './browser-api-request';
import { readAIIntent } from '../lib/ai-intent-preference';
import type {
  Email,
  EmailCategory,
  EmailThread,
  EmailLabel,
  EmailFilter,
  ComposeEmailRequest,
  MessageKind,
  SearchEmailRequest,
  Repository,
  Branch,
  Commit,
  PullRequest,
  Issue,
  Workflow,
  Build,
  Deployment,
  CalendarEvent,
  Calendar,
  Contact,
  ContactGroup,
  CompanyGroup,
  LetterGroup,
  GroupInviteLink,
  GroupInvitePreview,
  AIComposeRequest,
  MeetingExtraction,
} from '../types';

// Re-export shared types used by settings and other surfaces.
export type { EmailLabel } from '../types';

/**
 * RSVP result — the event DTO plus the v1 occurrence-vs-series scope the
 * backend reported (always present on current backends; optional for deploy
 * skew, the client derives the same shape via fallbackRsvpScope).
 */
export interface RsvpScopeInfo {
  kind: 'occurrence' | 'event';
  appliesTo: 'series' | 'event';
  fromOccurrence: string | null;
}
export type RsvpResponse = CalendarEvent & { rsvpScope?: RsvpScopeInfo };

/** A synced mail folder from the backend `/folders` API. */
export interface EmailFolder {
  id: string;
  userId: string;
  name: string;
  type: 'INBOX' | 'SENT' | 'DRAFTS' | 'SPAM' | 'TRASH' | 'ARCHIVE' | 'CUSTOM';
  color: string | null;
  icon: string | null;
  emailCount: number;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  // The backend error envelope serializes `details` for machine-readable
  // context (e.g. VERSION_CONFLICT carries { resource, id, expectedVersion,
  // currentVersion }); the fetch path returns the parsed JSON directly, so
  // details survive the cast at runtime.
  error?: { code: string; message: string; statusCode: number; details?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  metadata?: { total: number; page: number; pageSize: number; totalPages?: number };
  // The mail backend's list envelope carries pagination at the top level.
  // `nextCursor` (QM-UIUX-040) is the keyset position of the last row of
  // this page — pass it back as `cursor` for the next slice; null ends it.
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalCount?: number;
  nextCursor?: string | null;
}

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /**
   * Durable operation id for this logical mutation. When supplied it is sent
   * as the `Idempotency-Key` header verbatim (the caller owns reuse across
   * retries — e.g. the offline outbox with its mutation ids). When omitted
   * for a mutating call, the client mints one and keeps it in the
   * pending-operation ledger so a retry of the SAME logical operation reuses
   * it (see below).
   */
  idempotencyKey?: string;
}

/**
 * WR-MAIL-104: mint a client idempotency key for one logical mutation.
 *
 * The capability catalog marks every active mail command idempotency-required
 * and the backend now rejects keyless/malformed-key mutations with 4xx before
 * executing them. `crypto.randomUUID()` needs no Node imports, so it is safe
 * in browser bundles and SSR alike, and the value satisfies the server's
 * `[\w\-]{1,128}` key pattern.
 *
 * One key per api-client call = one key per logical operation from the
 * caller's perspective. A caller that retries ONE operation across attempts
 * must hold a stable key and pass it via `options.idempotencyKey` (the
 * offline outbox queue already does this with its mutation ids); a fresh key
 * per retry only dedupes concurrent duplicates, not sequential retries.
 */
export function mintIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Durable operation ids across retry/restart (fix/qm-idempotency-outbox-r3 —
 * answers the CODEX-REVIEW P0 "ordinary retry mints K2 after K1's lost
 * response" on PR #1124).
 *
 * The client mints ONE id per logical mutating call and keeps it in a
 * pending-operation ledger keyed by a fingerprint of (method, path, body).
 * If the response never arrives (timeout / network failure / abort), the
 * entry is kept, so the user's retry of the same logical operation reuses
 * K1 instead of minting K2 — the server then replays the committed outcome
 * (or answers 409 while it is still in flight) instead of executing the
 * mutation twice. Any HTTP response — success or error — completes the
 * operation and drops the entry, so a later identical call is a NEW logical
 * operation with a fresh id (e.g. send → undo-send → send again).
 *
 * The ledger is mirrored to localStorage so the id survives a browser
 * restart mid-operation; entries expire after 24h (the server's replay
 * window) and the ledger is capped. A hash collision only causes the server
 * to answer 422 IDEMPOTENCY_KEY_REUSE (fingerprint mismatch) — an honest
 * error, never a silent wrong replay.
 */
const PENDING_OPERATIONS_STORAGE_KEY = 'quantmail.pending-operations.v1';
const PENDING_OPERATION_TTL_MS = 24 * 3600 * 1000;
const PENDING_OPERATION_MAX_ENTRIES = 200;

interface PendingOperation {
  key: string;
  createdAt: number;
}

const pendingOperations = new Map<string, PendingOperation>();
let pendingOperationsHydrated = false;

function readPendingOperationsStorage(): Record<string, PendingOperation> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PENDING_OPERATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PendingOperation>;
  } catch {
    return {};
  }
}

function writePendingOperationsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, PendingOperation> = {};
    for (const [fingerprint, op] of pendingOperations) obj[fingerprint] = op;
    window.localStorage.setItem(PENDING_OPERATIONS_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* A ledger we cannot persist still protects this session's retries. */
  }
}

function hydratePendingOperations(): void {
  if (pendingOperationsHydrated) return;
  pendingOperationsHydrated = true;
  const now = Date.now();
  const stored = readPendingOperationsStorage();
  for (const [fingerprint, op] of Object.entries(stored)) {
    if (!op || typeof op.key !== 'string' || typeof op.createdAt !== 'number') continue;
    if (now - op.createdAt > PENDING_OPERATION_TTL_MS) continue;
    if (pendingOperations.size >= PENDING_OPERATION_MAX_ENTRIES) break;
    pendingOperations.set(fingerprint, op);
  }
}

function prunePendingOperations(now: number): void {
  for (const [fingerprint, op] of pendingOperations) {
    if (now - op.createdAt > PENDING_OPERATION_TTL_MS) pendingOperations.delete(fingerprint);
  }
  while (pendingOperations.size > PENDING_OPERATION_MAX_ENTRIES) {
    const oldest = pendingOperations.keys().next();
    if (oldest.done) break;
    pendingOperations.delete(oldest.value);
  }
}

/** Sync, non-cryptographic 64-bit hash (cyrb53) for the client-side ledger fingerprint. */
function hashOperationFingerprint(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Identifies one logical mutating call: method + path + stable body. */
function operationFingerprint(method: string, path: string, body: unknown): string {
  let bodyPart = '';
  try {
    bodyPart = JSON.stringify(body ?? null) ?? '';
  } catch {
    bodyPart = '';
  }
  return hashOperationFingerprint(`${method.toUpperCase()}\n${path}\n${bodyPart}`);
}

/**
 * Returns the durable id for this logical operation: the pending ledger's
 * key when this exact call is a retry of an unanswered operation, otherwise a
 * freshly minted id that is remembered until the response arrives.
 */
function durableOperationKey(fingerprint: string): string {
  hydratePendingOperations();
  const now = Date.now();
  prunePendingOperations(now);
  const pending = pendingOperations.get(fingerprint);
  if (pending) return pending.key; // Retry of an unanswered operation: reuse K1.
  const key = mintIdempotencyKey();
  pendingOperations.set(fingerprint, { key, createdAt: now });
  prunePendingOperations(now);
  writePendingOperationsStorage();
  return key;
}

/** Marks the logical operation complete: any HTTP response arrived. */
function completePendingOperation(fingerprint: string): void {
  hydratePendingOperations();
  if (pendingOperations.delete(fingerprint)) writePendingOperationsStorage();
}

/** Test seam: clears the in-memory ledger (and its persisted mirror). */
export function __clearPendingOperationsForTests(): void {
  pendingOperations.clear();
  pendingOperationsHydrated = true;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PENDING_OPERATIONS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * True when a mail search string uses Gmail-style operator syntax that the
 * legacy literal search (GET /emails/search) would match as plain text.
 * Mirrors the operator vocabulary of the backend SearchQueryService
 * (backend/services/search-query.service.ts): a known operator prefix at the
 * start of the query or after whitespace, or a "quoted phrase".
 *
 * Deliberately conservative: `bob@x.com`, `12:30`, and unknown prefixes
 * (`note: blah`) do NOT count — the backend parser treats those as literal
 * terms too, so routing them to the operator path would change nothing but
 * the response shape.
 */
const SEARCH_OPERATOR_PATTERN =
  /(?:^|\s)(from|to|subject|label|in|folder|has|is|before|after|newer_than|older_than):/i;
const QUOTED_PHRASE_PATTERN = /"[^"]+"/;

export function hasSearchOperatorSyntax(query: string): boolean {
  if (!query || typeof query !== 'string') return false;
  return SEARCH_OPERATOR_PATTERN.test(query) || QUOTED_PHRASE_PATTERN.test(query);
}

/**
 * True when the /search page's filter chips ride along with the query. The
 * operator route (GET /search/emails) has no chip params and resolves
 * `label:` against raw label values while the chip path resolves names to
 * ids — so a chip-filtered query always stays on the legacy literal path,
 * where the chips keep working exactly as before.
 */
function hasSearchFilterChips(params: Partial<SearchEmailRequest>): boolean {
  return Boolean(
    params.from?.trim() ||
      params.to?.trim() ||
      params.subject?.trim() ||
      params.hasAttachment === true ||
      params.label?.trim() ||
      params.dateFrom?.trim() ||
      params.dateTo?.trim(),
  );
}

/**
 * One OAuth authorization the signed-in user granted to a third-party app.
 * Served by GET /oauth/grants — the only source the security page's
 * "Connected Applications" tab is allowed to quote.
 */
export interface OAuthGrant {
  clientId: string;
  clientName: string;
  clientDescription: string | null;
  isFirstParty: boolean;
  scopes: string[];
  grantedAt: string;
  updatedAt: string;
}

/**
 * A personal access token row. The token VALUE is never returned here — the
 * backend only hands it out once, inside the POST /settings/tokens response.
 */
export interface PersonalAccessToken {
  id: string;
  tokenId: string;
  name: string;
  scopes: string[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Returned once, at mint time: the only moment the raw token value exists. */
export interface MintedPersonalAccessToken {
  id: string;
  token: string;
  tokenId: string;
  name: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
}

/**
 * Result of the bulk contact import endpoints
 * (`POST /contacts/import/vcard`, `POST /contacts/import/csv`).
 */
export interface ContactImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  total: number;
}

export interface EmailSignaturePreference {
  id: string;
  name: string;
  contentHtml: string;
  isDefault: boolean;
}

/**
 * A persisted follow-up reminder (fix/qm-followup-reminders). Server-backed:
 * the row survives reloads and the People home resurfaces due reminders at
 * the top of the conversation list. Dates travel as ISO strings.
 */
export interface FollowUpReminder {
  id: string;
  emailId: string;
  threadId: string | null;
  subject: string | null;
  remindAt: string;
  createdAt: string;
}

export interface VacationResponderPreference {
  id: string;
  enabled: boolean;
  subject: string;
  message: string;
  startAt: string | null;
  endAt: string | null;
  onlyContacts: boolean;
  intervalDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertVacationResponderPreference {
  enabled?: boolean;
  subject: string;
  message: string;
  startAt?: string | null;
  endAt?: string | null;
  onlyContacts?: boolean;
  intervalDays?: number;
}

/**
 * Data-export center (QM-BACK-006 backend, QM-UIUX-091 UI). The shapes below
 * are the backend's actual contract in `backend/routes/data-lifecycle.ts`:
 * the status union is the `DataExportStatus` Prisma enum — the backend has
 * no other states — and a completed export's artifact is an inventory
 * manifest delivered inline by the build call (`artifactRef` is
 * `inline-manifest:<id>`), never a download URL.
 */
export type DataExportStatus = 'requested' | 'completed' | 'failed';

export interface DataExportRequestRecord {
  id: string;
  userId: string;
  scope: string;
  status: DataExportStatus;
  artifactRef: string | null;
  error: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface DataExportManifestClass {
  count: number;
  retention: string;
}

export interface DataExportManifest {
  version: string;
  generatedAt: string;
  classes: {
    emails: DataExportManifestClass;
    threads: DataExportManifestClass;
    contacts: DataExportManifestClass;
    driveFiles: DataExportManifestClass;
  };
  compliance: {
    activeLegalHoldsPlacedByUser: number;
    priorExports: number;
    activeRetentionPolicies: number;
  };
  note: string;
}

export interface RequestDataExportResult {
  exportId: string;
  operationId: string;
  status: DataExportStatus;
  scope: string;
}

export interface BuildDataExportResult {
  exportId: string;
  status: DataExportStatus;
  artifactRef: string;
  manifest: DataExportManifest;
}

export interface MailFilterCondition {
  from?: string;
  to?: string;
  subjectContains?: string;
  bodyContains?: string;
  hasAttachment?: boolean;
  domain?: string;
}

export interface MailFilterAction {
  addLabelId?: string;
  moveToFolderId?: string;
  markRead?: boolean;
  star?: boolean;
  archive?: boolean;
  markSpam?: boolean;
  forwardTo?: string;
  delete?: boolean;
}

export interface MailFilterItem {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchAll: boolean;
  conditions: MailFilterCondition[];
  actions: MailFilterAction[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMailFilterInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  matchAll?: boolean;
  conditions: MailFilterCondition[];
  actions: MailFilterAction[];
}

export interface ApplyFilterResult {
  filterId: string;
  processedCount: number;
  affectedCount: number;
}

// ----------------------------------------------------------------------------
// Admin console KPIs (per-app /admin surface — restructure Phase 1 pilot).
// Read-only, staff-gated. Shapes mirror `backend/routes/admin.ts` exactly.
// ----------------------------------------------------------------------------

export interface AdminAccountsKpi {
  total: number;
}

export interface AdminActiveSessionsKpi {
  active: number;
  windowHours: number;
}

export interface AdminStorageKpi {
  usedBytes: number;
  fileCount: number;
}

export interface AdminDeliverabilityKpi {
  windowHours: number;
  total: number;
  queued: number;
  sent: number;
  deferred: number;
  bounced: number;
  /** Rate over resolved (sent + bounced) attempts; null when none have resolved. */
  successRate: number | null;
}

// ----------------------------------------------------------------------------
// Admin console: K9 (M19 Admin Domains + M20 DLP/Audit).
// Shapes mirror `backend/routes/admin.ts` exactly.
// ----------------------------------------------------------------------------

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface AdminMailDomainDnsCheck {
  key: 'ownership' | 'mx' | 'spf' | 'dkim' | 'dmarc';
  label: string;
  /** Derived from the stored cumulative verification stage — never invented. */
  status: 'verified' | 'pending';
}

export interface AdminMailDomain {
  id: string;
  organizationId: string;
  domain: string;
  verificationStatus: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
  dnsChecklist: AdminMailDomainDnsCheck[];
}

export interface AdminDnsInstructionRecord {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  description: string;
}

export interface AdminMailDomainRegistration {
  domain: AdminMailDomain;
  alreadyRegistered: boolean;
  /** Present only on a fresh registration — needed to set the DNS TXT record. */
  verificationToken?: string;
  instructions?: {
    domain: string;
    verificationToken: string;
    records: AdminDnsInstructionRecord[];
  };
}

export interface AdminMailDomainLiveCheck {
  key: string;
  label: string;
  valid: boolean;
  expected: string;
  actual?: string | string[] | null;
  error?: string | null;
}

export interface AdminMailDomainVerification {
  domain: AdminMailDomain;
  /** Fresh, live DNS results from the verify call. */
  dnsChecks: AdminMailDomainLiveCheck[];
}

export interface AdminDlpPolicy {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  action: string;
  severity: string;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminAuditLogEntry {
  id: string;
  userId: string;
  orgId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  timestamp: string;
  createdAt: string;
}

export interface AdminAuditLogQuery {
  page?: number;
  limit?: number;
  cursor?: string;
  organizationId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
}

// ============================================================================
// API Client
// ============================================================================

export class QuantMailApiClient {
  private baseUrl: string;
  private onAuthError?: () => void;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || '/api') {
    this.baseUrl = baseUrl;
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  onAuthenticationError(callback?: () => void): void {
    this.onAuthError = callback;
  }

  // --------------------------------------------------------------------------
  // Auth API
  // --------------------------------------------------------------------------

  // Email address ownership proof (POST, 6-digit code — replaces the dead
  // GET /auth/verify-email?token= which never existed on the backend).
  async verifyEmailCode(email: string, code: string): Promise<ApiResponse<{ emailVerified: boolean; alreadyVerified?: boolean }>> {
    return this.post('/auth/verify-email', { email, code });
  }

  async resendVerificationEmail(email: string): Promise<ApiResponse<{ emailSent: boolean; alreadyVerified?: boolean }>> {
    return this.post('/auth/resend-verification', { email });
  }

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/password-reset', { email });
  }

  /**
   * Out-of-band account recovery (fix/qm-account-recovery-3). The recovery
   * email is the address password-reset links are mailed to IN ADDITION to the
   * account's own inbox, for when the inbox itself is unreachable (forgot
   * password + no active session). Managed while signed in only — the backend
   * requires an authenticated session for both calls.
   */
  async getRecoveryEmail(): Promise<ApiResponse<{ recoveryEmail: string | null }>> {
    return this.get('/auth/account/recovery-email');
  }

  async setRecoveryEmail(
    email: string | null,
  ): Promise<ApiResponse<{ recoveryEmail: string | null }>> {
    return this.put('/auth/account/recovery-email', { email });
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/password-reset/confirm', { token, newPassword });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/change-password', { currentPassword, newPassword });
  }

  /**
   * Active browser sessions for the Security page (QM-SCREEN-016).
   *
   * Backend: GET /auth/sessions — one entry per refresh-token rotation family.
   * `isCurrent` marks the family holding this browser's refresh cookie.
   * `userAgent`/`ipAddress` are null for sessions issued before metadata
   * capture; the UI says "not recorded" for those instead of inventing a
   * device. Rows tagged as OAuth grants never appear here.
   */
  async getSessions(): Promise<
    ApiResponse<{
      sessions: {
        id: string;
        isCurrent: boolean;
        firstSeenAt: string;
        lastActiveAt: string;
        userAgent: string | null;
        ipAddress: string | null;
      }[];
    }>
  > {
    return this.get('/auth/sessions');
  }

  /**
   * "Revoke All" on the Security page: ends every other browser session.
   * Step-up guarded server-side — a stale session gets an honest
   * STEP_UP_REQUIRED message telling the user to sign in again first.
   */
  async revokeOtherSessions(): Promise<
    ApiResponse<{ revokedSessions: number; message: string }>
  > {
    return this.post('/auth/sessions/revoke-others', {});
  }

  async getUserInfo(): Promise<
    ApiResponse<{
      id: string;
      email: string;
      username: string;
      displayName: string;
      role: string;
    }>
  > {
    return this.get('/oauth/userinfo');
  }

  /**
   * The write side of `getUserInfo`. Settings' "Save display name" used to write
   * `localStorage` and toast success, and `getUserInfo` put the old name back on
   * the next mount — the two calls are deliberately the same shape so a save and
   * the reload after it cannot disagree.
   */
  async updateProfile(
    displayName: string,
  ): Promise<
    ApiResponse<{ id: string; email: string; username: string; displayName: string; role: string }>
  > {
    return this.patch('/auth/profile', { displayName });
  }

  /**
   * Two-factor authentication.
   *
   * `setupTwoFactor` no longer returns backup codes: codes handed out before an
   * authenticator has proved it holds the secret are codes for a factor that may
   * never be turned on. They come back from `enableTwoFactor` instead, once.
   *
   * The `otpauthUri` carries the shared secret, so it is rendered locally and
   * never sent anywhere — the previous version passed it to a third-party QR
   * image service, which put the second factor in someone else's access log.
   */
  async setupTwoFactor(): Promise<
    ApiResponse<{ secret: string; otpauthUri: string; issuer: string; account: string }>
  > {
    return this.post('/auth/2fa/setup', {});
  }

  async enableTwoFactor(
    code: string,
  ): Promise<ApiResponse<{ message: string; confirmedAt: string; backupCodes: string[] }>> {
    return this.post('/auth/2fa/enable', { code });
  }

  async getTwoFactorStatus(): Promise<
    ApiResponse<{
      enabled: boolean;
      pendingSetup: boolean;
      confirmedAt: string | null;
      backupCodesRemaining: number;
    }>
  > {
    return this.get('/auth/2fa/status');
  }

  /** Password-gated, not code-gated: whoever is here has probably lost the app. */
  async disableTwoFactor(password: string): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/2fa/disable', { password });
  }

  async regenerateBackupCodes(
    password: string,
  ): Promise<ApiResponse<{ backupCodes: string[]; count: number }>> {
    return this.post('/auth/2fa/backup-codes', { password });
  }

  // --------------------------------------------------------------------------
  // OAuth grants (Connected Applications)
  //
  // The security page used to hardcode "No third-party apps connected" and
  // assert that no app held email/profile permission — without ever asking the
  // server. These calls back GET /oauth/grants, the only source that tab may
  // quote. An empty array is the only honest empty state.
  // --------------------------------------------------------------------------

  async getOAuthGrants(): Promise<ApiResponse<OAuthGrant[]>> {
    return this.get('/oauth/grants');
  }

  /**
   * Revoke one app's grant. The backend scopes the delete to (userId, clientId)
   * from the authenticated session, so a grant that is not yours 404s instead
   * of being touched.
   */
  async revokeOAuthGrant(clientId: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.delete(`/oauth/grants/${encodeURIComponent(clientId)}`);
  }

  // --------------------------------------------------------------------------
  // Personal access tokens
  //
  // Backend routes (GET/POST/DELETE /settings/tokens) already exist; nothing
  // consumed them. Minting is step-up guarded server-side: when the session's
  // last strong authentication is stale the POST fails with 401
  // STEP_UP_REQUIRED and the UI must say so honestly (re-authenticate), not
  // invent a success. The raw token value appears only in the POST response.
  // --------------------------------------------------------------------------

  async getPersonalAccessTokens(): Promise<ApiResponse<PersonalAccessToken[]>> {
    return this.get('/settings/tokens');
  }

  async createPersonalAccessToken(input: {
    name: string;
    scopes: string[];
    expiresAt: string;
  }): Promise<ApiResponse<MintedPersonalAccessToken>> {
    return this.post('/settings/tokens', input);
  }

  async revokePersonalAccessToken(id: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.delete(`/settings/tokens/${encodeURIComponent(id)}`);
  }

  // --------------------------------------------------------------------------
  // Email API
  // --------------------------------------------------------------------------

  async getEmails(options?: {
    label?: string;
    category?: string;
    folderType?: string;
    page?: number;
    pageSize?: number;
    /** Keyset cursor from a previous response's `nextCursor` (QM-UIUX-040). */
    cursor?: string;
  }): Promise<PaginatedResponse<Email>> {
    return this.get('/emails', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Email>>;
  }

  async getEmail(id: string): Promise<ApiResponse<Email>> {
    return this.get(`/emails/${id}`);
  }

  /**
   * Gmail-style operator queries (`from:kundan`, `"exact phrase"`,
   * `has:attachment`, `before:2026-01-01`, ...) go to the operator-aware
   * backend route GET /search/emails (Next proxy /api/search/emails), which
   * parses them with SearchQueryService. The legacy literal path
   * (GET /emails/search) matches the raw query string with `contains`, so
   * operators typed there silently matched nothing.
   *
   * Plain-text queries — and operator-looking queries combined with the
   * /search page's filter chips — keep the exact legacy path, so their
   * behaviour is unchanged: the operator route has no chip params, and its
   * `label:` operator matches raw label values while the chip path resolves
   * label names to ids, so folding chips in would silently drop the label
   * filter. If the operator path answers success:false (backend down,
   * 4xx/5xx), fall back to the literal search rather than failing the query.
   *
   * The backend's search schema requires `q`; the app has always called the parameter
   * `query`. The Next proxy renames it, so the two only agreed as long as every call
   * went through the proxy — point `NEXT_PUBLIC_API_URL` at the backend and every
   * search is a 400. Sending both costs one query parameter and removes the hop.
   */
  async searchEmails(params: Partial<SearchEmailRequest>): Promise<PaginatedResponse<Email>> {
    const query = (params as { query?: string; q?: string }).query;
    const q = (params as { q?: string }).q ?? query;
    if (
      typeof q === 'string' &&
      q.trim().length > 0 &&
      hasSearchOperatorSyntax(q) &&
      !hasSearchFilterChips(params)
    ) {
      try {
        const operatorRes = (await this.get('/search/emails', {
          params: { q: q.trim(), page: params.page, pageSize: params.pageSize } as Record<
            string,
            string | number | boolean | undefined
          >,
        })) as PaginatedResponse<Email>;
        if (operatorRes && operatorRes.success) return operatorRes;
      } catch {
        // Fall through to the literal search below.
      }
    }
    return this.get('/emails/search', {
      params: { ...params, ...(q ? { q } : {}) } as Record<
        string,
        string | number | boolean | undefined
      >,
    }) as Promise<PaginatedResponse<Email>>;
  }

  /**
   * Omni cross-app search: emails + drive files + collaborative documents in one
   * backend call. Backs Universal Search (K10/M13). The Next app has a dedicated
   * `/api/search/all` route file that forwards to the backend `/search/all`.
   *
   * `files` are raw drive-file rows (id, name, mimeType, size, updatedAt, …),
   * `documents` are document rows (id, title, updatedAt, snapshotStorageKey).
   * All are the user's own — the backend scopes every leg by userId.
   */
  async searchAll(
    query: string,
    limit = 8,
  ): Promise<
    ApiResponse<{
      query: string;
      emails: Email[];
      files: Array<{
        id: string;
        name: string;
        mimeType?: string;
        size?: number;
        updatedAt?: string;
      }>;
      documents: Array<{ id: string; title: string; updatedAt?: string }>;
    }>
  > {
    return this.get('/search/all', { params: { q: query, limit } as any });
  }

  async composeEmail(data: ComposeEmailRequest): Promise<ApiResponse<Email>> {
    return this.post('/emails/compose', data);
  }

  /**
   * Update a server draft. Pass `options.expectedVersion` (the version the
   * composer last observed) for optimistic concurrency: the backend answers
   * 409 VERSION_CONFLICT instead of silently overwriting another tab's or
   * device's save. Omit it for the legacy unguarded write.
   */
  async updateDraft(
    id: string,
    data: ComposeEmailRequest,
    options?: { expectedVersion?: number },
  ): Promise<ApiResponse<Email>> {
    const body =
      options?.expectedVersion !== undefined
        ? { ...data, expectedVersion: options.expectedVersion }
        : data;
    return this.put(`/emails/${id}`, body);
  }

  async sendEmail(
    id: string,
    options?: { sendAt?: string; delayMs?: number; idempotencyKey?: string },
  ): Promise<ApiResponse<{ message: string; emailId: string; deliveryStatus: string }>> {
    // The idempotencyKey (when the caller holds one durable id for the send
    // attempt) travels via RequestOptions so request() sends it verbatim
    // instead of consulting the pending-operation ledger.
    const { idempotencyKey, ...sendBody } = options ?? {};
    return this.post(
      `/emails/${id}/send`,
      sendBody,
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  async undoSend(id: string): Promise<ApiResponse<{ message: string; emailId: string }>> {
    return this.post(`/emails/${id}/undo-send`, {});
  }

  async cancelSend(id: string): Promise<ApiResponse<{ message: string; emailId: string }>> {
    return this.post(`/emails/${id}/cancel-send`, {});
  }

  async importMbox(
    mboxData: string,
    options?: { folder?: string; maxMessages?: number },
  ): Promise<
    ApiResponse<{
      totalFound: number;
      importedCount: number;
      skippedCount: number;
      messageIds: string[];
    }>
  > {
    return this.post('/emails/import/mbox', {
      mboxData,
      folder: options?.folder,
      maxMessages: options?.maxMessages,
    });
  }

  async importImap(data: {
    host: string;
    port?: number;
    tls?: boolean;
    username: string;
    password?: string;
    accessToken?: string;
    mailbox?: string;
    maxMessages?: number;
    folder?: string;
  }): Promise<
    ApiResponse<{
      jobId: string;
      mailbox: string;
      totalFound: number;
      importedCount: number;
      skippedCount: number;
      messageIds: string[];
      threadsCreated: number;
      status: string;
    }>
  > {
    return this.post('/emails/import/imap', data);
  }

  async getImapJobStatus(jobId: string): Promise<ApiResponse<any>> {
    return this.get(`/emails/import/imap/status/${jobId}`);
  }

  /**
   * Reply in place, without going through the composer.
   *
   * `messageKind` is what the quick input in a thread uses to say the line it just
   * sent is chat, not a letter. Optional because the route defaults to `chat` for
   * exactly this call — the only sender of a letter is the full composer, which
   * posts to `/emails/compose` instead.
   */
  async replyToEmail(
    id: string,
    body: string,
    replyAll?: boolean,
    messageKind?: MessageKind,
    /**
     * Optional client-generated id. The backend echoes it in the realtime
     * `message.new` broadcast so the sender swaps its optimistic bubble for
     * the persisted row instead of rendering a duplicate (email-chat P0-3).
     */
    clientMessageId?: string,
    /**
     * Schedule-send: ISO timestamp of a future delivery time — the same
     * `sendAt` contract the composer passes to POST /emails/:id/send.
     * Omitted for an immediate reply so that call stays byte-identical.
     */
    sendAt?: string,
  ): Promise<ApiResponse<Email>> {
    return this.post(`/emails/${id}/reply`, {
      body,
      replyAll,
      messageKind,
      clientMessageId,
      ...(sendAt ? { sendAt } : {}),
    });
  }

  async forwardEmail(
    id: string,
    to: Array<{ email: string; name?: string }>,
    message?: string,
  ): Promise<ApiResponse<Email>> {
    return this.post(`/emails/${id}/forward`, { to, message });
  }

  async archiveEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/archive`, {});
  }

  async unarchiveEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/unarchive`, {});
  }

  async restoreEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/restore`, {});
  }

  async snoozeEmail(
    id: string,
    snoozeUntil: Date,
  ): Promise<ApiResponse<{ message: string; snoozedUntil: string }>> {
    return this.post(`/emails/${id}/snooze`, { snoozeUntil: snoozeUntil.toISOString() });
  }

  async unsnoozeEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/unsnooze`, {});
  }

  async markNotSpam(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/not-spam`, {});
  }

  async deleteEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/emails/${id}`);
  }

  async toggleStar(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/star`, {});
  }

  async togglePin(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/pin`, {});
  }

  async markAsRead(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/read`, {});
  }

  async markAsUnread(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/unread`, {});
  }

  async markAllRead(category?: string): Promise<ApiResponse<{ message: string; updated: number }>> {
    return this.post('/emails/mark-all-read', { category });
  }

  async setConversationCategory(
    anchorId: string,
    emailIds: string[],
    category: Exclude<EmailCategory, 'spam'>,
  ): Promise<ApiResponse<{ updated: number; emails: Email[]; learnedSenders: number }>> {
    return this.patch(`/emails/${anchorId}/category`, { emailIds, category });
  }

  async backfillInboxCategories(input: { limit?: number; cursor?: string }): Promise<
    ApiResponse<{
      scanned: number;
      updated: number;
      skipped: number;
      nextCursor: string | null;
      remaining: number;
    }>
  > {
    return this.post('/emails/categories/backfill', input);
  }

  async addLabel(emailId: string, label: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${emailId}/labels`, { label });
  }

  /**
   * Apply a label to an email by label id — the working endpoint behind the
   * inbox row's label picker (backend `POST /labels/apply`).
   */
  async applyLabel(emailId: string, labelId: string): Promise<ApiResponse<unknown>> {
    return this.post('/labels/apply', { emailId, labelId });
  }

  /**
   * Remove a label from an email by label id — the working endpoint behind the
   * inbox row's label picker (backend `POST /labels/remove`).
   */
  async removeLabel(emailId: string, labelId: string): Promise<ApiResponse<unknown>> {
    return this.post('/labels/remove', { emailId, labelId });
  }

  async getLabels(): Promise<ApiResponse<EmailLabel[]>> {
    return this.get('/labels');
  }

  async createLabel(name: string, color: string): Promise<ApiResponse<EmailLabel>> {
    return this.post('/labels', { name, color });
  }

  async updateLabel(
    id: string,
    data: { name?: string; color?: string },
  ): Promise<ApiResponse<EmailLabel>> {
    return this.put(`/labels/${id}`, data);
  }

  async deleteLabel(id: string): Promise<ApiResponse<EmailLabel>> {
    return this.delete(`/labels/${id}`);
  }

  // --------------------------------------------------------------------------
  // Folders API — synced cross-device via the backend `/folders` CRUD.
  // --------------------------------------------------------------------------

  async getFolders(): Promise<ApiResponse<EmailFolder[]>> {
    return this.get('/folders');
  }

  async createFolder(input: {
    name: string;
    color?: string;
  }): Promise<ApiResponse<EmailFolder>> {
    return this.post('/folders', { name: input.name, type: 'CUSTOM', color: input.color });
  }

  async updateFolder(
    id: string,
    data: { name?: string; color?: string },
  ): Promise<ApiResponse<EmailFolder>> {
    return this.put(`/folders/${id}`, data);
  }

  async deleteFolder(id: string): Promise<ApiResponse<EmailFolder>> {
    return this.delete(`/folders/${id}`);
  }

  async getEmailSignatures(): Promise<ApiResponse<EmailSignaturePreference[]>> {
    return this.get('/email-signatures');
  }

  async getDefaultEmailSignature(): Promise<ApiResponse<EmailSignaturePreference | null>> {
    return this.get('/email-signatures/default');
  }

  async createEmailSignature(
    data: Pick<EmailSignaturePreference, 'name' | 'contentHtml'> & { isDefault?: boolean },
  ): Promise<ApiResponse<EmailSignaturePreference>> {
    return this.post('/email-signatures', data);
  }

  async updateEmailSignature(
    id: string,
    data: Partial<Pick<EmailSignaturePreference, 'name' | 'contentHtml' | 'isDefault'>>,
  ): Promise<ApiResponse<EmailSignaturePreference>> {
    return this.put(`/email-signatures/${id}`, data);
  }

  async deleteEmailSignature(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/email-signatures/${id}`);
  }

  /**
   * Follow-up reminders (fix/qm-followup-reminders). The dead EmailFollowUpReminder
   * component used to toast-and-forget; these calls persist the reminder on the
   * backend and the People home resurfaces due ones.
   */
  async listFollowUpReminders(): Promise<ApiResponse<FollowUpReminder[]>> {
    return this.get('/follow-up-reminders');
  }

  async setFollowUpReminder(data: {
    emailId: string;
    threadId?: string;
    subject?: string;
    remindAt: string;
  }): Promise<ApiResponse<FollowUpReminder>> {
    return this.post('/follow-up-reminders', data);
  }

  async dismissFollowUpReminder(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/follow-up-reminders/${id}`);
  }

  async getVacationResponder(): Promise<ApiResponse<VacationResponderPreference | null>> {
    return this.get('/vacation-responder');
  }

  async upsertVacationResponder(
    data: UpsertVacationResponderPreference,
  ): Promise<ApiResponse<VacationResponderPreference>> {
    return this.put('/vacation-responder', data);
  }

  async enableVacationResponder(): Promise<ApiResponse<VacationResponderPreference>> {
    return this.post('/vacation-responder/enable', {});
  }

  async disableVacationResponder(): Promise<ApiResponse<VacationResponderPreference>> {
    return this.post('/vacation-responder/disable', {});
  }

  // ── Data exports (QM-BACK-006 / QM-UIUX-091) ─────────────────────────────
  // Through the Next proxy these land on the backend's `/data-lifecycle`
  // mount. Only the `mailbox-inventory` scope exists in v1, so the request
  // carries no scope choice — the backend defaults and validates it.
  async requestDataExport(): Promise<ApiResponse<RequestDataExportResult>> {
    return this.post('/data-lifecycle/exports', {});
  }

  async buildDataExport(exportId: string): Promise<ApiResponse<BuildDataExportResult>> {
    return this.post(`/data-lifecycle/exports/${encodeURIComponent(exportId)}/build`, {});
  }

  async listDataExports(): Promise<ApiResponse<DataExportRequestRecord[]>> {
    return this.get('/data-lifecycle/exports');
  }

  async getFilters(): Promise<ApiResponse<EmailFilter[]>> {
    return this.get('/mail-filters');
  }

  async getMailFilters(): Promise<ApiResponse<MailFilterItem[]>> {
    return this.get('/mail-filters');
  }

  async createMailFilter(data: CreateMailFilterInput): Promise<ApiResponse<MailFilterItem>> {
    return this.post('/mail-filters', data);
  }

  async updateMailFilter(
    id: string,
    data: Partial<CreateMailFilterInput>,
  ): Promise<ApiResponse<MailFilterItem>> {
    return this.put(`/mail-filters/${id}`, data);
  }

  async deleteMailFilter(id: string): Promise<ApiResponse<{ id: string }>> {
    return this.delete(`/mail-filters/${id}`);
  }

  async testMailFilter(
    id: string,
    sample: {
      fromAddress: string;
      toAddresses?: string[];
      subject?: string;
      bodyPlain?: string;
      hasAttachments?: boolean;
    },
  ): Promise<ApiResponse<{ matches: boolean }>> {
    return this.post(`/mail-filters/${id}/test`, sample);
  }

  async applyMailFilter(id: string): Promise<ApiResponse<ApplyFilterResult>> {
    return this.post(`/mail-filters/${id}/apply`, {});
  }

  async getEmailStats(): Promise<
    ApiResponse<{ totalEmails: number; unreadCount: number; sentCount: number; draftCount: number }>
  > {
    return this.get('/emails/stats');
  }

  async getThread(threadId: string): Promise<ApiResponse<EmailThread>> {
    return this.get(`/threads/${threadId}`);
  }

  /**
   * Read-receipt pipeline: mark a thread as read. The server stamps `readAt`
   * on the viewer's unread received messages and propagates it to the
   * senders' sent copies so their ticks flip to double-green. Idempotent.
   */
  async markThreadRead(threadId: string): Promise<ApiResponse<{ marked: number; readAt: string }>> {
    return this.post(`/threads/${threadId}/read`, {});
  }

  // --------------------------------------------------------------------------
  // Repository API
  // --------------------------------------------------------------------------

  async getRepos(options?: {
    visibility?: string;
    sort?: string;
    page?: number;
  }): Promise<PaginatedResponse<Repository>> {
    return this.get('/repos', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Repository>>;
  }

  async getRepo(id: string): Promise<ApiResponse<Repository>> {
    return this.get(`/repos/${id}`);
  }

  async createRepo(data: {
    name: string;
    description: string;
    visibility: string;
    initReadme?: boolean;
  }): Promise<ApiResponse<Repository>> {
    return this.post('/repos', data);
  }

  async deleteRepo(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/repos/${id}`);
  }

  async forkRepo(id: string): Promise<ApiResponse<Repository>> {
    return this.post(`/repos/${id}/fork`, {});
  }

  async getBranches(repoId: string): Promise<ApiResponse<Branch[]>> {
    return this.get(`/repos/${repoId}/branches`);
  }

  async getCommits(repoId: string, branch?: string): Promise<PaginatedResponse<Commit>> {
    return this.get(`/repos/${repoId}/commits`, {
      params: { branch } as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Commit>>;
  }

  async getPullRequests(repoId: string, status?: string): Promise<ApiResponse<PullRequest[]>> {
    return this.get(`/repos/${repoId}/pulls`, { params: { status } as any });
  }

  async createPullRequest(
    repoId: string,
    data: { title: string; body: string; sourceBranch: string; targetBranch: string },
  ): Promise<ApiResponse<PullRequest>> {
    return this.post(`/repos/${repoId}/pulls`, data);
  }

  async getIssues(repoId: string, status?: string): Promise<ApiResponse<Issue[]>> {
    return this.get(`/repos/${repoId}/issues`, { params: { status } as any });
  }

  async createIssue(
    repoId: string,
    data: { title: string; body: string },
  ): Promise<ApiResponse<Issue>> {
    return this.post(`/repos/${repoId}/issues`, data);
  }

  async getFileTree(repoId: string): Promise<ApiResponse<string[]>> {
    return this.get(`/repos/${repoId}/tree`);
  }

  async getFileContent(
    repoId: string,
    path: string,
  ): Promise<ApiResponse<{ path: string; content: string }>> {
    return this.get(`/repos/${repoId}/file`, { params: { path } });
  }

  // --------------------------------------------------------------------------
  // CI/CD API
  // --------------------------------------------------------------------------

  async getWorkflows(repoId?: string): Promise<ApiResponse<Workflow[]>> {
    return this.get('/ci/workflows', { params: { repo_id: repoId } as any });
  }

  async triggerWorkflow(
    id: string,
    branch?: string,
  ): Promise<ApiResponse<{ buildId: string; message: string }>> {
    return this.post(`/ci/workflows/${id}/trigger`, { branch });
  }

  async getBuilds(options?: {
    repoId?: string;
    status?: string;
    page?: number;
  }): Promise<PaginatedResponse<Build>> {
    return this.get('/ci/builds', {
      params: { repo_id: options?.repoId, status: options?.status, page: options?.page } as Record<
        string,
        string | number | boolean | undefined
      >,
    }) as Promise<PaginatedResponse<Build>>;
  }

  async getBuild(id: string): Promise<ApiResponse<Build>> {
    return this.get(`/ci/builds/${id}`);
  }

  async cancelBuild(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/ci/builds/${id}/cancel`, {});
  }

  async getDeployments(repoId?: string, environment?: string): Promise<ApiResponse<Deployment[]>> {
    return this.get('/ci/deployments', { params: { repo_id: repoId, environment } as any });
  }

  // --------------------------------------------------------------------------
  // Calendar API
  // --------------------------------------------------------------------------

  async getCalendars(): Promise<ApiResponse<Calendar[]>> {
    return this.get('/calendars');
  }

  async getEvents(options?: {
    calendarId?: string;
    start?: string;
    end?: string;
    type?: string;
  }): Promise<ApiResponse<CalendarEvent[]>> {
    return this.get('/events', { params: options as any });
  }

  async getUpcomingEvents(limit?: number): Promise<ApiResponse<CalendarEvent[]>> {
    return this.get('/events/upcoming', { params: { limit } as any });
  }

  async getTodayEvents(): Promise<ApiResponse<CalendarEvent[]>> {
    return this.get('/events/today');
  }

  async createEvent(
    data: Partial<CalendarEvent> & { title: string; startTime: string; endTime: string },
  ): Promise<ApiResponse<CalendarEvent>> {
    // The calendar backends disagree on field names: quantcalendar validates
    // startTime/endTime, the quantmail calendar route validates start/end.
    // Send both so a create never 400s depending on which service handles it.
    const payload = {
      ...data,
      startTime: data.startTime,
      endTime: data.endTime,
      start: data.startTime,
      end: data.endTime,
    };
    return this.post('/events', payload);
  }

  async updateEvent(
    id: string,
    data: Partial<CalendarEvent> & { scope?: string; sendUpdate?: boolean },
  ): Promise<ApiResponse<CalendarEvent>> {
    return this.put(`/events/${id}`, data);
  }

  async deleteEvent(
    id: string,
    options?: { scope?: string; notifyGuests?: boolean },
  ): Promise<ApiResponse<{ message: string }>> {
    const params = new URLSearchParams();
    if (options?.scope) params.set('scope', options.scope);
    // The delete dialog's "Notify guests" checkbox: unchecked → guests are
    // not emailed about the cancellation (backend defaults to notifying).
    if (options?.notifyGuests === false) params.set('notifyGuests', 'false');
    const qs = params.toString();
    return this.delete(`/events/${id}${qs ? `?${qs}` : ''}`);
  }

  /**
   * One event by id — backs the in-app event-detail screen (M09/K10).
   * The backend answers 404 EVENT_NOT_FOUND for an event the viewer can
   * neither organize nor attend; attendees read it read-only (viewerIsOwner
   * false) with viewerIsAttendee true.
   */
  async getEvent(id: string): Promise<ApiResponse<CalendarEvent>> {
    return this.get(`/events/${encodeURIComponent(id)}`);
  }

  /**
   * RSVP to an event the caller was invited to.
   * status is one of 'accepted' | 'declined' | 'tentative' | 'pending'.
   *
   * The backend reports rsvpScope (v1 occurrence-vs-series contract): the
   * RSVP always writes the series-level attendee list, and the UI must say
   * exactly what it covered.
   */
  async rsvpEvent(
    id: string,
    status: 'accepted' | 'declined' | 'tentative' | 'pending',
  ): Promise<ApiResponse<RsvpResponse>> {
    return this.post(`/events/${encodeURIComponent(id)}/rsvp`, { status });
  }

  /**
   * Text search over the user's events (title, description, location).
   * K10: real calendar backend endpoint for Universal Search.
   */
  async searchCalendarEvents(
    query: string,
    limit = 10,
  ): Promise<ApiResponse<CalendarEvent[]>> {
    return this.get('/events', { params: { q: query, limit } as any });
  }

  async findAvailableSlots(
    date: string,
    duration: number,
  ): Promise<
    ApiResponse<{ date: string; duration: number; slots: Array<{ start: Date; end: Date }> }>
  > {
    return this.post('/calendar/available-slots', { date, duration });
  }

  // --------------------------------------------------------------------------
  // Contacts API
  // --------------------------------------------------------------------------

  async getContacts(options?: {
    q?: string;
    tag?: string;
    favorites?: boolean;
    page?: number;
  }): Promise<PaginatedResponse<Contact>> {
    return this.get('/contacts', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Contact>>;
  }

  async getContact(id: string): Promise<ApiResponse<Contact>> {
    return this.get(`/contacts/${id}`);
  }

  /**
   * Every saved address, lowercased — for callers that need set membership rather
   * than contact records. `getContacts` cannot answer that: it is paginated at 20
   * by default and capped at 100, so a join against page one silently calls
   * contact 21 a stranger.
   *
   * Through the Next proxy this is `/api/contacts/directory` — a dedicated
   * route file (app/api/contacts/directory/route.ts) forwards
   * `/contacts/directory` to the backend verbatim. App Router gives static
   * segments precedence over the `[id]` dynamic route, so it never lands in
   * `[id]`; the same is true of `/contacts/search` and `/contacts/frequent`.
   */
  async getContactDirectory(): Promise<ApiResponse<{ emails: string[] }>> {
    return this.get('/contacts/directory');
  }

  /**
   * The user's most-frequently-contacted people, highest frequency first (then
   * most recently contacted, then name) — ranked server-side and not capped to a
   * single 20-row page the way `getContacts({ page: 1 })` is. Backs the
   * composer's contact autocomplete.
   *
   * Through the Next proxy this is `/api/contacts/frequent` — a dedicated
   * route file (app/api/contacts/frequent/route.ts) forwards
   * `/contacts/frequent` to the backend verbatim. App Router static segments
   * take precedence over the `[id]` dynamic route, so it never lands in `[id]`.
   * `limit` is clamped to 1..100 by the backend.
   */
  async getFrequentContacts(limit?: number): Promise<ApiResponse<Contact[]>> {
    return this.get('/contacts/frequent', { params: { limit } });
  }

  /**
   * Text search over the user's contacts — backs Universal Search (K10/M13).
   * Through the Next proxy this is `/api/contacts/search` (dedicated route
   * file), which forwards `/contacts/search` to the backend verbatim.
   */
  async searchContacts(query: string): Promise<ApiResponse<Contact[]>> {
    return this.get('/contacts/search', { params: { q: query } as any });
  }

  async createContact(data: Partial<Contact>): Promise<ApiResponse<Contact>> {
    return this.post('/contacts', data);
  }

  async updateContact(id: string, data: Partial<Contact>): Promise<ApiResponse<Contact>> {
    return this.put(`/contacts/${id}`, data);
  }

  async deleteContact(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/contacts/${id}`);
  }

  async getContactDuplicates(): Promise<
    ApiResponse<
      Array<{
        primaryContact: Contact;
        duplicates: Contact[];
        reason: 'email' | 'name';
      }>
    >
  > {
    return this.get('/contacts/duplicates');
  }

  /**
   * Company groups aggregated server-side across ALL of the user's contacts.
   * `getContacts` is paginated (20/page, capped at 100), so grouping from a
   * list page silently dropped companies whose members all sat on other
   * pages and undercounted members — this endpoint is the fix. The list's
   * `q`/`favorites` filters are honoured so a search still narrows the
   * Companies tab.
   *
   * Through the Next proxy this is `/api/contacts/companies` — a dedicated
   * route file (app/api/contacts/companies/route.ts) forwards
   * `/contacts/companies` to the backend verbatim. App Router static segments
   * take precedence over the `[id]` dynamic route, so it never lands in `[id]`;
   * the same is true of `/contacts/search`, `/contacts/frequent` and
   * `/contacts/directory`.
   */
  async getCompanyGroups(options?: {
    q?: string;
    favorites?: boolean;
  }): Promise<ApiResponse<CompanyGroup[]>> {
    return this.get('/contacts/companies', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<ApiResponse<CompanyGroup[]>>;
  }

  /**
   * Per-letter contact totals aggregated server-side across ALL of the user's
   * contacts. `getContacts` is paginated (20/page, capped at 100), so the
   * contacts page's A–Z headers and sidebar index counted only the loaded
   * page — "A (7)" on page 2 of 5 meant page 2's A-contacts, and letters whose
   * contacts all sat on other pages vanished from the index. This endpoint is
   * the fix. The list's `q`/`favorites` filters are honoured so a search still
   * narrows the index.
   *
   * Through the Next proxy this is `/api/contacts/letters` — a dedicated
   * route file (app/api/contacts/letters/route.ts) forwards `/contacts/letters`
   * to the backend verbatim. App Router static segments take precedence over
   * the `[id]` dynamic route, so it never lands in `[id]`; the same is true of
   * `/contacts/search`, `/contacts/frequent` and `/contacts/directory`.
   */
  async getLetterGroups(options?: {
    q?: string;
    favorites?: boolean;
  }): Promise<ApiResponse<LetterGroup[]>> {
    return this.get('/contacts/letters', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<ApiResponse<LetterGroup[]>>;
  }

  async mergeContacts(primaryId: string, duplicateIds: string[]): Promise<ApiResponse<Contact>> {
    return this.post('/contacts/merge', { primaryId, duplicateIds });
  }

  /**
   * Persist a "keep separate" decision for one duplicate pair so it stops
   * reappearing on rescan. The backend normalizes the pair order and stores
   * one row per (user, pair); `getContactDuplicates` filters those out.
   */
  async dismissDuplicatePair(
    primaryId: string,
    duplicateId: string,
  ): Promise<ApiResponse<{ dismissed: boolean }>> {
    return this.post('/contacts/duplicates/dismiss', { primaryId, duplicateId });
  }

  async deduplicateContacts(): Promise<ApiResponse<{ mergedCount: number }>> {
    return this.post('/contacts/deduplicate', {});
  }

  /**
   * Full address book as vCard via `GET /contacts/export/vcard`.
   * Unlike the old client-side export, this is NOT paginated — the backend
   * exports every contact, not just the current 20-row page.
   */
  async exportContactsVCard(): Promise<Response> {
    // Raw response (not JSON) — the backend streams the full address book as
    // text/vcard. Uses the authenticated browser request helper so the
    // session token is attached.
    return browserApiRequest('/api/contacts/export/vcard');
  }

  /**
   * Full address book as CSV via `GET /contacts/export/csv`.
   * Raw Response — caller reads the blob for download.
   */
  async exportContactsCsv(): Promise<Response> {
    return browserApiRequest('/api/contacts/export/csv');
  }

  async importContactsVCard(content: string): Promise<ApiResponse<ContactImportResult>> {
    return this.post('/contacts/import/vcard', { content });
  }

  async importContactsCsv(content: string): Promise<ApiResponse<ContactImportResult>> {
    return this.post('/contacts/import/csv', { content });
  }

  // --------------------------------------------------------------------------
  // Documents API (Task N11)
  // --------------------------------------------------------------------------

  async getDocument(id: string): Promise<ApiResponse<any>> {
    return this.get(`/documents/${id}`);
  }

  async getDocumentVersions(id: string): Promise<
    ApiResponse<
      Array<{
        id: string;
        docId: string;
        title: string;
        createdAt: string;
        content?: string;
      }>
    >
  > {
    return this.get(`/documents/${id}/versions`);
  }

  async createDocumentVersion(
    id: string,
    title?: string,
  ): Promise<
    ApiResponse<{
      id: string;
      docId: string;
      title: string;
      createdAt: string;
      content?: string;
    }>
  > {
    return this.post(`/documents/${id}/versions`, { title });
  }

  async restoreDocumentVersion(id: string, versionId: string): Promise<ApiResponse<any>> {
    return this.post(`/documents/${id}/versions/${versionId}/restore`, {});
  }

  async createDocumentShareLink(
    id: string,
    data?: { role?: 'view' | 'edit'; expiresAt?: string },
  ): Promise<
    ApiResponse<{
      id: string;
      token: string;
      role: 'view' | 'edit';
      expiresAt: string | null;
      shareUrl: string;
    }>
  > {
    return this.post(`/documents/${id}/share-link`, data ?? {});
  }

  // P0-4b: real collaborator invite for QuantDocs (POST /documents/:id/collaborators).
  // The doc share dialog previously never called anything here.
  async addDocumentCollaborator(
    id: string,
    data: { email: string; role?: 'viewer' | 'editor' | 'admin' },
  ): Promise<
    ApiResponse<{
      id: string;
      docId: string;
      email: string;
      role: string;
    }>
  > {
    return this.post(`/documents/${id}/collaborators`, data);
  }

  async revokeDocumentShareLink(id: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.delete(`/documents/${id}/share-link`);
  }

  // --------------------------------------------------------------------------
  // Contact groups API
  //
  // `getContactGroups()` lived here once with no route behind it, returned a 404
  // envelope, and was deleted with the note that "an API client method is a
  // promise that an endpoint exists." `/contact-groups` now exists
  // (`backend/routes/contact-groups.ts`), so the promise is one the server keeps.
  // The other half of that pair, `syncContacts()`, is still absent and stays
  // absent — nothing on the server syncs contacts from anywhere.
  // --------------------------------------------------------------------------

  /**
   * Every group, name-ascending. Unpaginated, matching the server: these render
   * as a chip strip the user built by hand, and a page two the strip never shows
   * is a group the user cannot reach.
   */
  async getContactGroups(): Promise<ApiResponse<ContactGroup[]>> {
    return this.get('/contact-groups');
  }

  async createContactGroup(data: {
    name: string;
    emails?: string[];
    color?: string | null;
  }): Promise<ApiResponse<ContactGroup>> {
    return this.post('/contact-groups', data);
  }

  /**
   * `emails` is a full replacement, not a merge — the editor always holds the
   * whole member list, so an add/remove pair would let two clients editing the
   * same group interleave silently. Send only the fields that changed; the
   * server rejects an empty body rather than reporting a no-op as success.
   */
  async updateContactGroup(
    id: string,
    data: { name?: string; emails?: string[]; color?: string | null },
  ): Promise<ApiResponse<ContactGroup>> {
    return this.put(`/contact-groups/${id}`, data);
  }

  async deleteContactGroup(id: string): Promise<ApiResponse<ContactGroup>> {
    return this.delete(`/contact-groups/${id}`);
  }

  // --------------------------------------------------------------------------
  // Contact group admin roles and invite links
  //
  // The owner is the group's implicit admin; promoting/demoting/removing
  // members is owner-gated server-side (404-before-403, like every other
  // group route). Admins are member addresses the owner promoted — the
  // "Admin" badge in the group info modal.
  // --------------------------------------------------------------------------

  /** Promote a member to admin. The address must already be a member. */
  async promoteGroupAdmin(
    id: string,
    email: string,
  ): Promise<ApiResponse<ContactGroup>> {
    return this.post(`/contact-groups/${id}/admins`, { email });
  }

  /** Demote an admin back to a plain member. */
  async demoteGroupAdmin(
    id: string,
    email: string,
  ): Promise<ApiResponse<ContactGroup>> {
    return this.delete(`/contact-groups/${id}/admins/${encodeURIComponent(email)}`);
  }

  /** Remove one member from the group (also strips their admin role). */
  async removeGroupMember(
    id: string,
    email: string,
  ): Promise<ApiResponse<ContactGroup>> {
    return this.delete(`/contact-groups/${id}/members/${encodeURIComponent(email)}`);
  }

  /**
   * Create or regenerate the group's join link. Regenerating invalidates the
   * old link — the escape hatch for a link shared in the wrong place.
   */
  async createGroupInviteLink(id: string): Promise<ApiResponse<GroupInviteLink>> {
    return this.post(`/contact-groups/${id}/invite-link`, {});
  }

  /** The active join link, or `data: null` when there isn't one. */
  async getGroupInviteLink(id: string): Promise<ApiResponse<GroupInviteLink | null>> {
    return this.get(`/contact-groups/${id}/invite-link`);
  }

  /** Revoke the join link. The token is cleared, not merely expired. */
  async revokeGroupInviteLink(id: string): Promise<ApiResponse<ContactGroup>> {
    return this.delete(`/contact-groups/${id}/invite-link`);
  }

  /**
   * Public preview of a join link — what the join page shows before the
   * visitor signs in. Carries no member addresses, only the group name, the
   * member count, and the owner's name.
   */
  async getGroupInvitePreview(token: string): Promise<ApiResponse<GroupInvitePreview>> {
    return this.get(`/contact-groups/invite/${encodeURIComponent(token)}`);
  }

  /** Join a group via its invite link. Adds the signed-in user's own address. */
  async joinGroupByInvite(token: string): Promise<ApiResponse<ContactGroup>> {
    return this.post('/contact-groups/join', { token });
  }

  // --------------------------------------------------------------------------
  // AI API
  // --------------------------------------------------------------------------

  /**
   * The "How much thinking" preference is attached here rather than by the
   * composer, so every current and future caller of `aiCompose` sends it without
   * having to remember to. `tier` comes back so the caller can report what
   * actually ran — on this route the tier sets the length ceiling (never below
   * what an explicit `length` implies), the timeout, and the model when a
   * deployment pins one.
   */
  async aiCompose(
    data: AIComposeRequest,
  ): Promise<ApiResponse<{ subject: string; body: string; suggestions: string[]; tier?: string }>> {
    return this.post('/ai/compose', { ...data, intent: readAIIntent() });
  }

  async aiAutocomplete(
    text: string,
    subject?: string,
  ): Promise<ApiResponse<{ completions: string[] }>> {
    return this.post('/ai/autocomplete', { text, subject });
  }

  async aiSummarize(emailId: string): Promise<ApiResponse<{ emailId: string; summary: string }>> {
    // The summarize route lives on the emails router (registered at /emails),
    // not under /ai — the old GET /ai/summarize/email/:id path 404ed.
    return this.post(`/emails/${emailId}/summarize`, {});
  }

  async aiSummarizeThread(
    messages: Array<{ from: string; subject: string; body: string; date?: string }>,
  ): Promise<
    ApiResponse<{ summary: string; keyPoints: string[]; actionItems: string[]; messageCount: number }>
  > {
    return this.post('/ai/summarize-thread', { messages });
  }

  /**
   * QM-SCREEN-005 R2: real sender-safety scan. Calls the backend AI phishing
   * detector via the Next proxy (`POST /api/emails/:id/detect-phishing` →
   * backend `/emails/:id/detect-phishing`, auth-gated). The thread views call
   * this per inbound message, lazily, through `usePhishingCheck` — a failed
   * scan must never resolve to an all-clear (see that hook's contract).
   */
  async detectPhishing(
    emailId: string,
  ): Promise<
    ApiResponse<{ emailId: string; isPhishing: boolean; confidence: number; indicators: string[] }>
  > {
    return this.post(`/emails/${encodeURIComponent(emailId)}/detect-phishing`, {});
  }

  async aiCategorize(
    emailIds: string[],
  ): Promise<ApiResponse<Array<{ emailId: string; category: string }>>> {
    return this.post('/ai/categorize', { emailIds });
  }

  async aiPriority(
    emailIds: string[],
  ): Promise<ApiResponse<Array<{ emailId: string; priority: string }>>> {
    return this.post('/ai/priority', { emailIds });
  }

  async aiExtractMeetings(
    emailId: string,
  ): Promise<ApiResponse<{ emailId: string; meetings: MeetingExtraction[] }>> {
    return this.get(`/ai/meetings/${emailId}`);
  }

  async aiSuggestReplies(
    emailId: string,
  ): Promise<
    ApiResponse<{
      emailId: string;
      suggestions: Array<{
        content: string;
        confidence: number;
        evidence: Array<{
          label: string;
          quote?: string;
          quoteTruncated?: boolean;
          deepLink?: string;
          resourceRef: { resourceId: string; resourceType: string; appId: string };
        }>;
      }>;
      provenance: {
        producedBy: string;
        capabilityId: string;
        capabilityVersion: number;
        contextBytes: number;
        contextTruncated: boolean;
        sourceCount: number;
      };
      cost: { credits: number; meter: string; quoteRequired: boolean; estimated: boolean };
    }>
  > {
    // The reply-suggestions route lives on the AI router mounted at /emails
    // (backend/routes/ai.ts: GET /:id/reply-suggestions), not under /ai — the
    // old GET /ai/replies/:id path was never allow-listed and 404ed, so the UI
    // silently fell back to canned replies.
    // QM-QUANTY-002: the backend now returns the full envelope (suggestions
    // with evidence refs, provenance, cost) — passed through untouched.
    return this.get(`/emails/${emailId}/reply-suggestions`);
  }

  /**
   * QM-QUANTY-002 — preview before mutation. Returns the exact
   * MutationPreview the user reviews before POST /emails/:id/send runs.
   * Read-only: never queues or sends.
   */
  async aiSendPreview(emailId: string): Promise<
    ApiResponse<{
      capabilityId: string;
      capabilityVersion: number;
      summary: string;
      changes: Array<{ description: string; detail?: Record<string, unknown> }>;
      requiresApproval: boolean;
      approvalReason?: string;
      cost: { credits: number; meter: string; quoteRequired: boolean; estimated: boolean };
      reversibility: {
        reversible: boolean;
        undoCapabilityId?: string;
        undoToken?: string;
        note: string;
      };
      idempotencyKey: string;
      createdAt: string;
    }>
  > {
    return this.post(`/emails/${emailId}/send-preview`, {});
  }

  // --------------------------------------------------------------------------
  // Workspaces (shared collaboration spaces, roles + email invites)
  // --------------------------------------------------------------------------

  async listWorkspaces(): Promise<ApiResponse<WorkspaceSummary[]>> {
    return this.get('/workspaces');
  }

  async createWorkspace(input: {
    name: string;
    description?: string;
  }): Promise<ApiResponse<WorkspaceSummary>> {
    return this.post('/workspaces', input);
  }

  async getWorkspace(id: string): Promise<ApiResponse<WorkspaceDetail>> {
    return this.get(`/workspaces/${id}`);
  }

  async updateWorkspace(
    id: string,
    input: { name?: string; description?: string | null },
  ): Promise<ApiResponse<WorkspaceSummary>> {
    return this.patch(`/workspaces/${id}`, input);
  }

  async deleteWorkspace(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.delete(`/workspaces/${id}`);
  }

  async listWorkspaceMembers(id: string): Promise<ApiResponse<WorkspaceMember[]>> {
    return this.get(`/workspaces/${id}/members`);
  }

  async updateWorkspaceMemberRole(
    id: string,
    memberId: string,
    role: WorkspaceRole,
  ): Promise<ApiResponse<WorkspaceMember[]>> {
    return this.patch(`/workspaces/${id}/members/${memberId}`, { role });
  }

  async removeWorkspaceMember(
    id: string,
    memberId: string,
  ): Promise<ApiResponse<{ removed: boolean }>> {
    return this.delete(`/workspaces/${id}/members/${memberId}`);
  }

  async leaveWorkspace(id: string): Promise<ApiResponse<{ left: boolean }>> {
    return this.post(`/workspaces/${id}/leave`, {});
  }

  async listWorkspaceInvites(id: string): Promise<ApiResponse<WorkspaceInvite[]>> {
    return this.get(`/workspaces/${id}/invites`);
  }

  async inviteToWorkspace(
    id: string,
    input: { emails: string[]; role: InviteRole; message?: string },
  ): Promise<ApiResponse<{ results: InviteSendResult[]; invites: WorkspaceInvite[] }>> {
    return this.post(`/workspaces/${id}/invites`, input);
  }

  async resendWorkspaceInvite(
    id: string,
    inviteId: string,
  ): Promise<ApiResponse<{ inviteId: string; inviteUrl: string; emailSent: boolean }>> {
    return this.post(`/workspaces/${id}/invites/${inviteId}/resend`, {});
  }

  async revokeWorkspaceInvite(
    id: string,
    inviteId: string,
  ): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.delete(`/workspaces/${id}/invites/${inviteId}`);
  }

  async getInvitePreview(token: string): Promise<ApiResponse<InvitePreview>> {
    return this.get(`/public/invites/${token}`);
  }

  async acceptInvite(
    token: string,
  ): Promise<ApiResponse<{ workspaceId: string; role: WorkspaceRole }>> {
    return this.post(`/invites/${token}/accept`, {});
  }

  // --------------------------------------------------------------------------
  // Admin console API (per-app /admin surface — read-only KPIs, staff-gated)
  //
  // Dual-mounted server-side at `/admin/*` and `/api/admin/*`, so these resolve
  // whether the base URL is the Next proxy (`/api`) or an absolute backend host.
  // A non-staff caller gets 403 and an unauthenticated one 401 — the console's
  // KPI cards fall back to their honest "awaiting" state on any non-success.
  // --------------------------------------------------------------------------

  async getAdminAccountsCount(): Promise<ApiResponse<AdminAccountsKpi>> {
    return this.get('/admin/accounts/count');
  }

  async getAdminActiveSessions(): Promise<ApiResponse<AdminActiveSessionsKpi>> {
    return this.get('/admin/sessions/active');
  }

  async getAdminStorageSummary(): Promise<ApiResponse<AdminStorageKpi>> {
    return this.get('/admin/storage/summary');
  }

  async getAdminDeliverability(): Promise<ApiResponse<AdminDeliverabilityKpi>> {
    return this.get('/admin/mail/deliverability');
  }

  // --------------------------------------------------------------------------
  // Admin console: K9 (M19 Admin Domains + M20 DLP/Audit).
  //
  // Staff-gated on the backend (`backend/routes/admin.ts` — 401 unauthenticated,
  // 403 non-staff, 400 when the organization scope is missing). Shapes mirror
  // the backend responses exactly; every number on the admin screens comes
  // from these calls — nothing is invented client-side.
  // --------------------------------------------------------------------------

  async getAdminOrganizations(): Promise<ApiResponse<{ organizations: AdminOrganization[] }>> {
    return this.get('/admin/organizations');
  }

  async listAdminMailDomains(
    organizationId: string,
  ): Promise<ApiResponse<{ organizationId: string; domains: AdminMailDomain[] }>> {
    return this.get('/admin/mail/domains', { params: { organizationId } });
  }

  async registerAdminMailDomain(
    organizationId: string,
    domain: string,
  ): Promise<ApiResponse<AdminMailDomainRegistration>> {
    return this.post('/admin/mail/domains', { organizationId, domain });
  }

  async verifyAdminMailDomain(
    domainId: string,
    organizationId: string,
  ): Promise<ApiResponse<AdminMailDomainVerification>> {
    return this.post(`/admin/mail/domains/${encodeURIComponent(domainId)}/verify`, {
      organizationId,
    });
  }

  async deleteAdminMailDomain(
    domainId: string,
    organizationId: string,
  ): Promise<ApiResponse<{ removed: boolean; id: string }>> {
    return this.delete(`/admin/mail/domains/${encodeURIComponent(domainId)}`, { organizationId });
  }

  async listAdminDlpPolicies(
    organizationId: string,
  ): Promise<ApiResponse<{ organizationId: string; policies: AdminDlpPolicy[] }>> {
    return this.get('/admin/mail/dlp/policies', { params: { organizationId } });
  }

  async listAdminAuditLogs(
    params?: AdminAuditLogQuery,
  ): Promise<ApiResponse<AdminAuditLogEntry[]>> {
    return this.get('/admin/audit/logs', { params: params as Record<string, string | number> });
  }

  // --------------------------------------------------------------------------
  // HTTP Methods
  // --------------------------------------------------------------------------

  private async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  private async post<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  private async put<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  private async patch<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  private async delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, body, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    // Support both relative (/api) and absolute (http://...) base URLs
    const isAbsolute = this.baseUrl.startsWith('http://') || this.baseUrl.startsWith('https://');
    let urlStr: string;

    if (isAbsolute) {
      const url = new URL(path, this.baseUrl);
      if (options?.params) {
        for (const [key, value] of Object.entries(options.params)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }
      urlStr = url.toString();
    } else {
      const base = `${this.baseUrl}${path}`;
      const paramEntries = Object.entries(options?.params || {}).filter(
        ([, v]) => v !== undefined && v !== null,
      );
      const qs = paramEntries.length
        ? '?' +
          paramEntries
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
        : '';
      urlStr = `${base}${qs}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
    // WR-MAIL-104: active mail commands require Idempotency-Key server-side.
    // fix/qm-idempotency-outbox-r3: ONE durable id per logical operation.
    // A caller-supplied options.idempotencyKey (or Idempotency-Key header,
    // e.g. the offline outbox retrying one queued mutation) is used verbatim.
    // Otherwise the pending-operation ledger mints K1 once and reuses it when
    // THIS exact call is retried after its response never arrived — an
    // ordinary retry no longer mints K2 after K1's lost response.
    let pendingFingerprint: string | undefined;
    if (MUTATING_METHODS.has(method.toUpperCase())) {
      const hasKey = Object.keys(headers).some((h) => h.toLowerCase() === 'idempotency-key');
      if (!hasKey) {
        if (options?.idempotencyKey) {
          headers['Idempotency-Key'] = options.idempotencyKey;
        } else {
          pendingFingerprint = operationFingerprint(method, path, body);
          headers['Idempotency-Key'] = durableOperationKey(pendingFingerprint);
        }
      }
    }
    const hadAccessToken = Boolean(browserAuthSession.getAccessToken());

    try {
      const response = await browserAuthSession.authenticatedFetch(urlStr, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options?.signal,
      });

      // fix/qm-idempotency-mail-routes (CODEX-REVIEW on merged #1145): K1 is
      // the operation's identity until a VALIDATED authoritative terminal
      // outcome arrives — response headers alone are not enough. The old code
      // dropped the pending id as soon as headers arrived, before
      // response.json() ran: a 200 with a truncated body (or a
      // proxy-generated 502/504 after the mutation committed) deleted K1,
      // the retry minted K2, and the server executed the mutation twice.
      let parsed: ApiResponse<T>;
      try {
        parsed = (await response.json()) as ApiResponse<T>;
      } catch {
        // The body never fully arrived: treat like no response — KEEP K1 so
        // the retry reuses it and the server replays the committed outcome
        // instead of executing the mutation a second time.
        return {
          success: false,
          error: {
            code: 'PARSE_ERROR',
            message: 'The server response was incomplete. Please try again.',
            statusCode: response.status,
          },
        };
      }

      if (response.status === 401 && hadAccessToken) {
        this.onAuthError?.();
      }

      if (pendingFingerprint) {
        // Only a fully-parsed terminal outcome completes the logical
        // operation: a 2xx (authoritative success) or a 4xx other than 409
        // (authoritative rejection — the mutation did not run), after which a
        // later identical call is a NEW operation with a fresh id (e.g.
        // send → undo-send → send again). Everything else keeps K1: 409 may
        // be IDEMPOTENCY_IN_FLIGHT for our own key (the operation is still
        // unanswered — the retry reuses K1 and the server replays); any 5xx
        // may have committed server-side (gateway-timeout-after-commit), so
        // the retry must reuse K1 and let the server replay instead of
        // executing twice. (A 409 from a handler-level conflict released the
        // server-side claim, so reusing K1 there is equally safe.)
        const terminal =
          (response.status >= 200 && response.status < 300) ||
          (response.status >= 400 && response.status < 500 && response.status !== 409);
        if (terminal) completePendingOperation(pendingFingerprint);
      }

      return parsed;
    } catch (error) {
      // No response arrived (timeout / network failure / abort): the server
      // may have committed the mutation, so KEEP the pending id — the retry
      // reuses K1 and the server replays instead of executing twice.
      // A timed-out request (see FETCH_TIMEOUT_MS in browser-auth-session)
      // rejects with our Error reason; a caller-cancelled one rejects with a
      // DOMException. Surface timeouts distinctly so UIs can say "timed out"
      // instead of a generic network error.
      const message = error instanceof Error ? error.message : 'Network request failed';
      const timedOut =
        error instanceof Error &&
        (/timed out/i.test(error.message) || error.name === 'TimeoutError');
      return {
        success: false,
        error: {
          code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: timedOut ? 'Request timed out. Please try again.' : message,
          statusCode: 0,
        },
      };
    }
  }
}

// Singleton instance
export const apiClient = new QuantMailApiClient();
