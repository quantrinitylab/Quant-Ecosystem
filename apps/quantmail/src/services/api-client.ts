// ============================================================================
// QuantMail - Frontend API Client
// ============================================================================

import type {
  Email,
  EmailThread,
  EmailLabel,
  EmailFilter,
  ComposeEmailRequest,
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
  LoginRequest,
  RegisterRequest,
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

// ============================================================================
// API Client
// ============================================================================

export class QuantMailApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
  private onAuthError?: () => void;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || '/api') {
    this.baseUrl = baseUrl;
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  setTokens(accessToken: string, refreshToken?: string): void {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  onTokenRefreshed(
    callback: (tokens: { accessToken: string; refreshToken: string }) => void,
  ): void {
    this.onTokenRefresh = callback;
  }

  onAuthenticationError(callback: () => void): void {
    this.onAuthError = callback;
  }

  // --------------------------------------------------------------------------
  // Auth API
  // --------------------------------------------------------------------------

  async register(data: RegisterRequest): Promise<ApiResponse<{ userId: string; message: string }>> {
    return this.post('/auth/register', data);
  }

  async login(data: LoginRequest): Promise<
    ApiResponse<{
      userId: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      requiresTwoFactor?: boolean;
    }>
  > {
    const response = await this.post<any>('/auth/login', data);
    if (response.success && response.data?.accessToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  }

  async logout(): Promise<void> {
    if (this.accessToken) {
      await this.post('/oauth/revoke', { token: this.accessToken });
    }
    this.clearTokens();
  }

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

  async setupTwoFactor(): Promise<
    ApiResponse<{ secret: string; qrCodeUrl: string; backupCodes: string[] }>
  > {
    return this.post('/auth/2fa/setup', {});
  }

  async enableTwoFactor(
    secret: string,
    code: string,
    backupCodes: string[],
  ): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/2fa/enable', { secret, code, backupCodes });
  }

  // --------------------------------------------------------------------------
  // Email API
  // --------------------------------------------------------------------------

  async getEmails(options?: {
    label?: string;
    category?: string;
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

  async searchEmails(params: Partial<SearchEmailRequest>): Promise<PaginatedResponse<Email>> {
    return this.get('/emails/search', {
      params: params as Record<string, string | number | boolean | undefined>,
    }) as Promise<PaginatedResponse<Email>>;
  }

  async composeEmail(data: ComposeEmailRequest): Promise<ApiResponse<Email>> {
    return this.post('/emails/compose', data);
  }

  async sendEmail(id: string): Promise<ApiResponse<{ message: string; emailId: string }>> {
    return this.post(`/emails/${id}/send`, {});
  }

  async replyToEmail(id: string, body: string, replyAll?: boolean): Promise<ApiResponse<Email>> {
    return this.post(`/emails/${id}/reply`, { body, replyAll });
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

  async deleteEmail(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/emails/${id}`);
  }

  async toggleStar(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/emails/${id}/star`, {});
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
    return this.post('/events', data);
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

  async createContact(data: Partial<Contact>): Promise<ApiResponse<Contact>> {
    return this.post('/contacts', data);
  }

  async updateContact(id: string, data: Partial<Contact>): Promise<ApiResponse<Contact>> {
    return this.put(`/contacts/${id}`, data);
  }

  async deleteContact(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.delete(`/contacts/${id}`);
  }

  async getContactGroups(): Promise<ApiResponse<ContactGroup[]>> {
    return this.get('/contacts/groups');
  }

  async syncContacts(
    app: string,
    action: string,
  ): Promise<ApiResponse<{ syncedCount: number; message: string }>> {
    return this.post('/contacts/sync', { app, action });
  }

  // --------------------------------------------------------------------------
  // AI API
  // --------------------------------------------------------------------------

  async aiCompose(
    data: AIComposeRequest,
  ): Promise<ApiResponse<{ subject: string; body: string; suggestions: string[] }>> {
    return this.post('/ai/compose', data);
  }

  async aiAutocomplete(
    text: string,
    subject?: string,
  ): Promise<ApiResponse<{ completions: string[] }>> {
    return this.post('/ai/autocomplete', { text, subject });
  }

  async aiSummarize(emailId: string): Promise<ApiResponse<{ emailId: string; summary: string }>> {
    return this.get(`/ai/summarize/email/${emailId}`);
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

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(urlStr, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      });

      if (response.status === 401 && this.refreshToken) {
        // Try to refresh the token
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          // Retry the original request
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(urlStr, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          return (await retryResponse.json()) as ApiResponse<T>;
        } else {
          this.onAuthError?.();
          return {
            success: false,
            error: { code: 'AUTH_ERROR', message: 'Authentication failed', statusCode: 401 },
          };
        }
      }

      const data = (await response.json()) as ApiResponse<T>;
      return data;
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

  private async tryRefreshToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: 'quantmail-web',
        }),
      });

      if (!response.ok) return false;

      const data = (await response.json()) as { access_token: string; refresh_token: string };
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.onTokenRefresh?.({ accessToken: data.access_token, refreshToken: data.refresh_token });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const apiClient = new QuantMailApiClient();
