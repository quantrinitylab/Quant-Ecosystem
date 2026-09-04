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
import { readAIIntent } from '../lib/ai-intent-preference';
import type {
  Email,
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
  AIComposeRequest,
  MeetingExtraction,
} from '../types';

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; statusCode: number };
  metadata?: Record<string, unknown>;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  metadata?: { total: number; page: number; pageSize: number; totalPages?: number };
}

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

interface EmailSignaturePreference {
  id: string;
  name: string;
  contentHtml: string;
  isDefault: boolean;
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

  async verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
    return this.get('/auth/verify-email', { params: { token } });
  }

  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/password-reset', { email });
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

  async getUserInfo(): Promise<
    ApiResponse<{ id: string; email: string; username: string; displayName: string; role: string }>
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
  // Email API
  // --------------------------------------------------------------------------

  async getEmails(options?: {
    label?: string;
    category?: string;
    folderType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Email>> {
    return this.get('/emails', {
      params: options as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Email>>;
  }

  async getEmail(id: string): Promise<ApiResponse<Email>> {
    return this.get(`/emails/${id}`);
  }

  /**
   * The backend's search schema requires `q`; the app has always called the parameter
   * `query`. The Next proxy renames it, so the two only agreed as long as every call
   * went through the proxy — point `NEXT_PUBLIC_API_URL` at the backend and every
   * search is a 400. Sending both costs one query parameter and removes the hop.
   */
  async searchEmails(params: Partial<SearchEmailRequest>): Promise<PaginatedResponse<Email>> {
    const query = (params as { query?: string; q?: string }).query;
    const q = (params as { q?: string }).q ?? query;
    return this.get('/emails/search', {
      params: { ...params, ...(q ? { q } : {}) } as Record<
        string,
        string | number | boolean | undefined
      >,
    }) as Promise<PaginatedResponse<Email>>;
  }

  async composeEmail(data: ComposeEmailRequest): Promise<ApiResponse<Email>> {
    return this.post('/emails/compose', data);
  }

  async updateDraft(id: string, data: ComposeEmailRequest): Promise<ApiResponse<Email>> {
    return this.put(`/emails/${id}`, data);
  }

  async sendEmail(
    id: string,
  ): Promise<ApiResponse<{ message: string; emailId: string; deliveryStatus: string }>> {
    return this.post(`/emails/${id}/send`, {});
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
  ): Promise<ApiResponse<Email>> {
    return this.post(`/emails/${id}/reply`, { body, replyAll, messageKind });
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

  async markAsRead(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/read`, {});
  }

  async markAsUnread(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/unread`, {});
  }

  async markAllRead(category?: string): Promise<ApiResponse<{ message: string; updated: number }>> {
    return this.post('/emails/mark-all-read', { category });
  }

  async addLabel(emailId: string, label: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${emailId}/labels`, { label });
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

  async getFilters(): Promise<ApiResponse<EmailFilter[]>> {
    return this.get('/filters');
  }

  async getEmailStats(): Promise<
    ApiResponse<{ totalEmails: number; unreadCount: number; sentCount: number; draftCount: number }>
  > {
    return this.get('/emails/stats');
  }

  async getThread(threadId: string): Promise<ApiResponse<EmailThread>> {
    return this.get(`/threads/${threadId}`);
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

  async deploy(data: {
    buildId: string;
    repoId: string;
    environment: string;
    version: string;
  }): Promise<ApiResponse<Deployment>> {
    return this.post('/ci/deployments', data);
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

  async updateEvent(id: string, data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
    return this.put(`/events/${id}`, data);
  }

  async deleteEvent(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/events/${id}`);
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
   * Through the Next proxy this is `/api/contacts/directory`, which lands in the
   * `[id]` route and forwards `/contacts/directory` verbatim — the same way
   * `/contacts/search` and `/contacts/frequent` would.
   */
  async getContactDirectory(): Promise<ApiResponse<{ emails: string[] }>> {
    return this.get('/contacts/directory');
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

  // `getContactGroups()` and `syncContacts()` used to live here. Neither route
  // existed on the server, so both returned a 404 envelope; nothing in the app
  // called them, so nothing noticed. Removed rather than stubbed — an API client
  // method is a promise that an endpoint exists.

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
  ): Promise<ApiResponse<{ emailId: string; suggestions: string[] }>> {
    return this.get(`/ai/replies/${emailId}`);
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

  private async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
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
    const hadAccessToken = Boolean(browserAuthSession.getAccessToken());

    try {
      const response = await browserAuthSession.authenticatedFetch(urlStr, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options?.signal,
      });

      if (response.status === 401 && hadAccessToken) {
        this.onAuthError?.();
      }

      return (await response.json()) as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed',
          statusCode: 0,
        },
      };
    }
  }
}

// Singleton instance
export const apiClient = new QuantMailApiClient();
