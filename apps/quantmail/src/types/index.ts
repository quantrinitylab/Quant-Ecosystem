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
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDraft: boolean;
  labels: string[];
  attachments: EmailAttachment[];
  inReplyTo?: string;
  references: string[];
  headers: Record<string, string>;
  receivedAt: Date;
  scheduledAt?: Date;
  snoozedUntil?: Date;
  trashedAt?: Date;
  aiSummary?: string;
  aiCategory?: EmailCategory;
  phishingScore?: number;
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
  sshUrl: string;
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
}

export interface Contact extends BaseEntity {
  userId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  title?: string;
  avatarUrl?: string;
  addresses: ContactAddress[];
  tags: string[];
  notes?: string;
  birthday?: string;
  socialLinks: Record<string, string>;
  lastContactedAt?: Date;
  isFavorite: boolean;
  source: QuantApp | 'import' | 'manual';
  syncedApps: QuantApp[];
}

export interface ContactAddress {
  type: 'home' | 'work' | 'other';
  street: string;
  city: string;
  state: string;
  country: string;
  zip: string;
}

export interface ContactGroup extends BaseEntity {
  userId: string;
  name: string;
  contacts: string[];
  color?: string;
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
