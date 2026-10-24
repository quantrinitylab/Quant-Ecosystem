// ============================================================================
// QuantMail - Type Definitions
// ============================================================================

import type { BaseEntity, MediaAttachment, PermissionScope, QuantApp } from '@quant/common';

export type { QuantApp };

// ============================================================================
// Email Types
// ============================================================================

export type EmailPriority = 'high' | 'normal' | 'low';
export type EmailCategory = 'primary' | 'social' | 'promotions' | 'updates' | 'forums' | 'spam';
export type EmailStatus = 'draft' | 'sending' | 'sent' | 'delivered' | 'failed' | 'bounced';

/**
 * Mail or chat: the two ways a message in a conversation can be written.
 *
 * A `mail` is a full letter — its own subject line, a rich body, cc/bcc,
 * attachments. A `chat` is a line typed straight into the thread. Both are real
 * messages that leave over the same delivery path and land in the same thread, so
 * the difference is only which composer wrote it and which mark the conversation
 * shows. Lowercase to match how `priority` and `category` read on the wire.
 */
export type MessageKind = 'mail' | 'chat';

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Email extends BaseEntity {
  threadId: string;
  userId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  priority: EmailPriority;
  category: EmailCategory;
  status: EmailStatus;
  /**
   * How the message was written: a full letter or a line typed into the
   * conversation. Optional because a message stored before the column existed
   * comes back without it; read it through `messageKindOf` in `lib/threading`,
   * which supplies the fallback in one place.
   */
  messageKind?: MessageKind;
  /**
   * The ids of the stored rows folded into this one bubble by
   * `collapseDuplicateSends` — the Sent copy and its delivery copy are two rows
   * for one send, and only one of them survives grouping.
   *
   * It exists so a mailbox action can still reach the copy that stopped being
   * visible: archiving what the screen calls one conversation has to move every
   * row it was made of, or the twin stays in the inbox and the row comes back.
   * Absent on a message that was never part of a pair.
   */
  collapsedIds?: string[];
  isRead: boolean;
  isStarred: boolean;
  isPinned?: boolean;
  isArchived: boolean;
  isDraft: boolean;
  isSpam?: boolean;
  folderId?: string | null;
  labels: string[];
  attachments: EmailAttachment[];
  inReplyTo?: string;
  references: string[];
  headers: Record<string, string>;
  receivedAt: Date;
  scheduledAt?: Date;
  snoozedUntil?: Date;
  trashedAt?: Date;
  /**
   * Read-receipt pipeline (WhatsApp-style ticks on outbound messages).
   * `deliveredAt` is stamped when the message reaches the recipient's mailbox
   * or the outbound transport accepts it; `readAt` is stamped on the sender's
   * sent copy when a recipient opens the thread. ISO strings on the wire.
   * Absent on rows written before the pipeline existed.
   */
  deliveredAt?: string | Date;
  readAt?: string | Date;
  /**
   * Open tracking (Superhuman-class read statuses on sent mail). The beacon
   * counts image loads by EXTERNAL recipients; the internal readAt ticks
   * above cover QuantMail recipients. `openTrackingEnabled` is the
   * per-message opt-out (composer default ON); `openCount`/`firstOpenedAt`/
   * `lastOpenedAt` are stamped by GET /track/open/:token. Absent or zero =
   * never opened — an honest unknown when the recipient blocks remote
   * images, not proof of non-reading.
   */
  openTrackingEnabled?: boolean;
  openCount?: number;
  firstOpenedAt?: string | Date;
  lastOpenedAt?: string | Date;
  aiSummary?: string;
  aiCategory?: EmailCategory;
  phishingScore?: number;
  /**
   * Optimistic-concurrency version (QM-BACK-002). The backend increments it
   * on every draft write and answers 409 VERSION_CONFLICT when a client sends
   * a stale `expectedVersion`. Composers track it to detect edits from other
   * tabs/devices. Absent on rows written before the column existed.
   */
  version?: number;
  /**
   * fix/qm-accounts-import-corrective-3 (migration 0110): the AUTHORITATIVE
   * send-as identity id persisted on the row. The backend re-authorizes it
   * at send time (fail-closed); the /compose page restores the From picker
   * from it when reopening a draft. Null/absent = the account's own address.
   */
  sendAsIdentityId?: string | null;
}

export interface EmailAttachment extends BaseEntity {
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  contentId?: string;
  isInline: boolean;
}

export interface EmailThread extends BaseEntity {
  userId: string;
  subject: string;
  participants: EmailAddress[];
  messageCount: number;
  lastMessageAt: Date;
  isRead: boolean;
  isStarred: boolean;
  isPinned?: boolean;
  labels: string[];
  snippet: string;
  messages: Email[];
}

export interface EmailLabel extends BaseEntity {
  userId: string;
  name: string;
  color: string;
  icon?: string;
  isSystem: boolean;
  messageCount: number;
  unreadCount: number;
}

export interface EmailFilter extends BaseEntity {
  userId: string;
  name: string;
  conditions: FilterCondition[];
  actions: FilterAction[];
  isEnabled: boolean;
  priority: number;
}

export interface FilterCondition {
  field: 'from' | 'to' | 'subject' | 'body' | 'hasAttachment' | 'size';
  operator:
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'startsWith'
    | 'endsWith'
    | 'greaterThan'
    | 'lessThan';
  value: string;
}

export interface FilterAction {
  type: 'label' | 'archive' | 'star' | 'markRead' | 'delete' | 'forward' | 'category';
  value?: string;
}

export interface ComposeEmailRequest {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  priority?: EmailPriority;
  attachments?: any[];
  inReplyTo?: string;
  isDraft?: boolean;
  scheduledAt?: string;
  /**
   * Which composer wrote this. Optional so a caller that has no opinion keeps the
   * server's default of a letter; the server never reclassifies a draft on an
   * update that omits it.
   */
  messageKind?: MessageKind;
  /**
   * Per-message open-tracking beacon opt-out. Omitted = ON (the backend
   * applies the same default), so a composer that never heard of tracking
   * still sends tracked mail; pass false only from an explicit user toggle.
   */
  trackOpens?: boolean;
  /**
   * fix/qm-accounts-import: verified send-as identity id to stamp as the
   * message's From. Omitted = the account's own address. An explicit null on
   * a draft update reverts the From back to the account's own address.
   */
  sendAsId?: string | null;
}

export interface SearchEmailRequest {
  query: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  label?: string;
  category?: EmailCategory;
  dateFrom?: string;
  dateTo?: string;
  isRead?: boolean;
  isStarred?: boolean;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Git/Repository Types
// ============================================================================

export type RepoVisibility = 'public' | 'private' | 'internal';
export type BranchProtection = 'none' | 'require_reviews' | 'require_ci' | 'strict';
export type PRStatus = 'open' | 'closed' | 'merged' | 'draft';
export type IssueStatus = 'open' | 'closed' | 'in_progress';
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'commented';

export interface Repository extends BaseEntity {
  ownerId: string;
  name: string;
  fullName: string;
  description: string;
  visibility: RepoVisibility;
  defaultBranch: string;
  language: string;
  languages: Record<string, number>;
  stars: number;
  forks: number;
  openIssues: number;
  size: number;
  isTemplate: boolean;
  isFork: boolean;
  forkedFrom?: string;
  topics: string[];
  license?: string;
  homepageUrl?: string;
  cloneUrl: string;
  lastPushAt?: Date;
}

export interface Branch {
  name: string;
  sha: string;
  isProtected: boolean;
  protection: BranchProtection;
  aheadBy: number;
  behindBy: number;
  lastCommit: Commit;
}

export interface Commit {
  sha: string;
  message: string;
  author: GitUser;
  committer: GitUser;
  timestamp: Date;
  parents: string[];
  stats: { additions: number; deletions: number; total: number };
  files: CommitFile[];
}

export interface CommitFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GitUser {
  name: string;
  email: string;
  username?: string;
  avatarUrl?: string;
}

export interface PullRequest extends BaseEntity {
  repoId: string;
  number: number;
  title: string;
  body: string;
  author: GitUser;
  status: PRStatus;
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  isMergeable: boolean;
  mergeConflicts: boolean;
  reviewers: Reviewer[];
  labels: string[];
  milestone?: string;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergedAt?: Date;
  mergedBy?: GitUser;
  closedAt?: Date;
}

export interface Reviewer {
  user: GitUser;
  status: ReviewStatus;
  reviewedAt?: Date;
}

export interface Issue extends BaseEntity {
  repoId: string;
  number: number;
  title: string;
  body: string;
  author: GitUser;
  status: IssueStatus;
  assignees: GitUser[];
  labels: string[];
  milestone?: string;
  comments: number;
  reactions: Record<string, number>;
  closedAt?: Date;
  closedBy?: GitUser;
}

export interface CodeReview extends BaseEntity {
  pullRequestId: string;
  reviewer: GitUser;
  status: ReviewStatus;
  body: string;
  comments: ReviewComment[];
  submittedAt: Date;
}

export interface ReviewComment {
  id: string;
  path: string;
  line: number;
  body: string;
  author: GitUser;
  createdAt: Date;
}

// ============================================================================
// CI/CD Types
// ============================================================================

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped';
export type DeploymentEnv = 'development' | 'staging' | 'production';
export type ArtifactType = 'binary' | 'container' | 'archive' | 'report' | 'log';

export interface Workflow extends BaseEntity {
  repoId: string;
  name: string;
  filename: string;
  isEnabled: boolean;
  trigger: WorkflowTrigger;
  jobs: WorkflowJob[];
  lastRunAt?: Date;
  lastRunStatus?: WorkflowStatus;
}

export interface WorkflowTrigger {
  events: string[];
  branches?: string[];
  paths?: string[];
  schedule?: string;
}

export interface WorkflowJob {
  id: string;
  name: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  runner: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
}

export interface WorkflowStep {
  name: string;
  status: WorkflowStatus;
  command?: string;
  output?: string;
  duration?: number;
}

export interface Build extends BaseEntity {
  workflowId: string;
  repoId: string;
  number: number;
  status: WorkflowStatus;
  branch: string;
  commit: string;
  commitMessage: string;
  author: GitUser;
  trigger: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  jobs: WorkflowJob[];
  artifacts: Artifact[];
  logs: string;
}

export interface Deployment extends BaseEntity {
  buildId: string;
  repoId: string;
  environment: DeploymentEnv;
  status: WorkflowStatus;
  version: string;
  url?: string;
  deployer: GitUser;
  startedAt: Date;
  completedAt?: Date;
  rollbackVersion?: string;
  healthCheck?: { status: 'healthy' | 'unhealthy' | 'degraded'; checkedAt: Date };
}

export interface Artifact extends BaseEntity {
  buildId: string;
  name: string;
  type: ArtifactType;
  size: number;
  url: string;
  expiresAt: Date;
  checksum: string;
}

// ============================================================================
// Calendar Types
// ============================================================================

export type EventType = 'meeting' | 'reminder' | 'task' | 'birthday' | 'holiday' | 'focus';
export type EventRecurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RSVPStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

export interface CalendarEvent extends BaseEntity {
  userId: string;
  calendarId: string;
  title: string;
  description: string;
  type: EventType;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  location?: string;
  meetingUrl?: string;
  recurrence: EventRecurrence;
  recurrenceEnd?: Date;
  attendees: EventAttendee[];
  reminders: EventReminder[];
  color?: string;
  isPrivate: boolean;
  attachments: string[];
  conferenceData?: ConferenceData;
}

export interface EventAttendee {
  email: string;
  name?: string;
  rsvp: RSVPStatus;
  isOrganizer: boolean;
  isOptional: boolean;
}

export interface EventReminder {
  type: 'email' | 'push' | 'sms';
  minutesBefore: number;
}

/**
 * Honest outcome of the backend's guest-notification attempt on event
 * save/delete (fix/qm-calendar-event-guest-notify). `notified` is only true
 * when a real update/cancellation email went out; `reason` explains every
 * other outcome so the UI never fakes a confirmation.
 */
export interface GuestNotificationStatus {
  notified: boolean;
  count: number;
  reason?:
    | 'sent'
    | 'no-guests'
    | 'not-requested'
    | 'declined'
    | 'mail-not-configured'
    | 'send-failed'
    | 'occurrence-notify-not-wired';
}

export interface ConferenceData {
  provider: 'quantmeet' | 'zoom' | 'teams' | 'custom';
  url: string;
  meetingId?: string;
  password?: string;
}

export interface Calendar extends BaseEntity {
  userId: string;
  name: string;
  color: string;
  isDefault: boolean;
  isShared: boolean;
  sharedWith: string[];
  timezone: string;
}

// ============================================================================
// Contact Types
// ============================================================================

export interface ContactSuggestion {
  email: string;
  name?: string;
  avatar?: string;
  frequency?: number;
  /**
   * The fields the compose autocomplete now also matches on (Gmail matches
   * names, addresses AND company names). Kept optional because not every
   * suggestion source carries them — the filter just skips what's absent.
   */
  company?: string;
  phone?: string;
  tags?: string[];
}

/**
 * A frequent correspondent who is NOT a saved contact yet — aggregated from
 * real mail by `GET /contacts/suggestions` (the Gmail "Merge & Fix"
 * analogue). `name` is null when no mail from the address ever carried a
 * display name; render the address itself rather than inventing one.
 * `lastMessageAt` arrives as an ISO string over the wire.
 */
export interface ContactActivitySuggestion {
  email: string;
  name: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  direction: 'inbound' | 'outbound' | 'both';
}

/**
 * A contact as the backend API actually returns it (Prisma `Contact` row —
 * id, userId, name, email, avatar, phone, company, tags, isFavorite,
 * frequency, lastContactedAt, createdAt, updatedAt). Fields the backend never
 * sends (firstName/lastName/title/addresses/notes/birthday/socialLinks) were
 * removed: they never rendered and invented API shape the server does not
 * have. `avatar` is the backend's URL-string column — the only avatar field.
 */
export interface Contact extends BaseEntity {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  avatar?: string;
  tags: string[];
  lastContactedAt?: Date;
  isFavorite: boolean;
  frequency?: number;
  source: QuantApp | 'import' | 'manual';
  syncedApps: QuantApp[];
}

/**
 * One company card on the Companies tab, aggregated server-side across ALL of
 * the user's contacts (not just the loaded list page). Members are full
 * contact rows so inspect/call/email keep working on them.
 */
export interface CompanyGroup {
  name: string;
  /** Most common email domain among members, `@`-prefixed — derived, never invented. */
  subtitle?: string;
  members: Contact[];
}

/**
 * One letter bucket of the contacts A–Z index, aggregated server-side across
 * ALL of the user's contacts (not just the loaded list page) via
 * GET /contacts/letters. The page used to count from the paginated list page,
 * so "A (7)" on page 2 of 5 counted only page 2's A-contacts.
 */
export interface LetterGroup {
  letter: string;
  count: number;
}

export interface ContactAddress {
  type: 'home' | 'work' | 'other';
  street: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

/**
 * A named set of addresses the user writes to as a unit — "Family", "Standup".
 *
 * Membership is `emails`, not contact ids. This interface said `contacts:
 * string[]` for as long as it was unused, and the name mattered the moment a
 * server started sending the real shape: `Contact` is keyed
 * `@@unique([userId, email])`, so in this schema an address already *is* a
 * person's identity, and the group editor accepts addresses that have no
 * contact row at all. See `contact_groups` in the Prisma schema.
 */
export interface ContactGroup extends BaseEntity {
  userId: string;
  name: string;
  /** Trimmed and lowercased by the server, so one address is one member. */
  emails: string[];
  /** Member addresses promoted to admin. Always a subset of `emails`. */
  adminEmails: string[];
  /** Active join-link token, or null/undefined while no link exists. */
  inviteToken?: string | null;
  /** `#rrggbb`, or null while the group has no accent of its own. */
  color?: string | null;
}

/** A group's join link, as created by POST /contact-groups/:id/invite-link. */
export interface GroupInviteLink {
  token: string;
  inviteUrl: string;
  createdAt: string;
}

/**
 * Public preview of a join link — the join page shows this before the visitor
 * signs in. Deliberately carries no member addresses: group name, member
 * count, and the owner's name only.
 */
export interface GroupInvitePreview {
  groupName: string;
  memberCount: number;
  ownerName: string;
}

// ============================================================================
// OAuth/Auth Types
// ============================================================================

export interface OAuthClient extends BaseEntity {
  clientId: string;
  clientSecret: string;
  name: string;
  description: string;
  redirectUris: string[];
  allowedScopes: PermissionScope[];
  grantTypes: string[];
  isFirstParty: boolean;
  app?: QuantApp;
  logoUrl?: string;
  homepageUrl?: string;
  privacyUrl?: string;
  tosUrl?: string;
}

export interface AuthorizationGrant extends BaseEntity {
  userId: string;
  clientId: string;
  scopes: PermissionScope[];
  expiresAt: Date;
  isRevoked: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    deviceId: string;
  };
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName: string;
  acceptTerms: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

// ============================================================================
// AI Feature Types
// ============================================================================

export interface AIComposeRequest {
  instructions: string;
  tone?: 'professional' | 'casual' | 'formal' | 'friendly';
  length?: 'short' | 'medium' | 'long';
  context?: {
    recipient?: string;
    subject?: string;
    previousEmails?: string[];
  };
}

export interface AISummarizeRequest {
  emailId: string;
  threadId?: string;
  maxLength?: number;
}

export interface AICategorizeRequest {
  emailIds: string[];
}

export interface AIPriorityRequest {
  emailIds: string[];
}

export interface MeetingExtraction {
  title: string;
  dateTime: string;
  duration: number;
  location?: string;
  attendees: string[];
  agenda?: string;
  confidence: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  desktopNotifications: boolean;
  digestFrequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  quietHours: { start: string; end: string; timezone: string } | null;
  categories: Record<string, boolean>;
}
