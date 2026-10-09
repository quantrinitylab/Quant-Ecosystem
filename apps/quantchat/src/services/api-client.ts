// ============================================================================
// QuantChat - Frontend API Client
// ============================================================================

import type {
  Message,
  Conversation,
  ChatContact,
  Story,
  Snap,
  SnapStreak,
  SnapMemory,
  Call,
  Group,
  DiscoverItem,
  Publisher,
  ARFilter,
  Bitmoji,
  FriendLocation,
  Place,
  GeoFilter,
  SmartReply,
  TranslationResult,
  ModerationResult,
  Notification,
  AuthTokens,
  SendMessageRequest,
  CreateStoryRequest,
  SendSnapRequest,
  InitiateCallRequest,
  CreateGroupRequest,
  LocationUpdateRequest,
  StoryHighlight,
  PhoneAuthRequest,
  OTPVerifyRequest,
  ChannelView,
  SubscribedChannelView,
  ChannelMessageView,
  MeView,
} from '../types';
import { apiFetchRaw } from '@quant/api-client';
import { sanitizeErrorMessage } from '../lib/sanitize-error';

/**
 * Global ceiling for any single API request. `apiFetchRaw` keeps native fetch
 * semantics (no timeout unless asked), so without this a backend that accepts
 * the connection and never responds leaves the caller's promise — and the
 * UI spinner on top of it — hanging forever. Mirrors the fleet pattern:
 * PR #621's 10s AbortController for auth checks, the shared `apiFetch`
 * default, and QuantMail's FETCH_TIMEOUT_MS in browser-auth-session.
 * Per-call override via RequestOptions.timeout (0 disables the ceiling).
 */
export const REQUEST_TIMEOUT_MS = 30_000;

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; statusCode: number };
  metadata?: Record<string, unknown>;
}

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Per-call timeout in ms (default REQUEST_TIMEOUT_MS; 0 = no timeout). */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// QuantMeet (C08) meeting-room types — mirrors backend room.service shapes
// ---------------------------------------------------------------------------

export interface MeetingRoomSettings {
  maxParticipants: number;
  waitingRoom: boolean;
  muteOnEntry: boolean;
  allowScreenShare: boolean;
  enableRecording: boolean;
  enableTranscript: boolean;
}

export interface MeetingParticipant {
  id: string;
  userId: string;
  displayName: string;
  role: 'host' | 'co-host' | 'participant';
  audioEnabled: boolean;
  videoEnabled: boolean;
  joinedAt: string;
}

export interface MeetingRoomSummary {
  id: string;
  name: string;
  hostId: string;
  status: 'active' | 'closed';
  settings: MeetingRoomSettings;
  participants: MeetingParticipant[];
  createdAt: string;
}

export interface CreateMeetingRoomRequest {
  name: string;
  settings: MeetingRoomSettings;
}

export interface JoinMeetingRoomRequest {
  displayName?: string;
  role?: 'host' | 'co-host' | 'participant';
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

export interface JoinMeetingRoomResponse {
  room: MeetingRoomSummary;
  token: string;
  participant: MeetingParticipant;
  /** Public SFU websocket URL (media auth is the token, not this URL). */
  serverUrl: string;
}

// ============================================================================
// API Client
// ============================================================================

export class QuantChatApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private deviceId: string;
  private onTokenRefresh?: (tokens: AuthTokens) => void;
  private onAuthError?: () => void;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
    this.deviceId = this.generateDeviceId();
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  setCallbacks(callbacks: {
    onTokenRefresh?: (tokens: AuthTokens) => void;
    onAuthError?: () => void;
  }): void {
    this.onTokenRefresh = callbacks.onTokenRefresh;
    this.onAuthError = callbacks.onAuthError;
  }

  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------

  async loginWithPassword(credentials: { identifier: string; password: string }): Promise<
    ApiResponse<
      AuthTokens & {
        user: { id: string; email: string; username: string; displayName?: string };
      }
    >
  > {
    const response = await this.post<
      AuthTokens & {
        user: { id: string; email: string; username: string; displayName?: string };
      }
    >('/auth/login', credentials);
    if (response.success && response.data) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  }

  async requestOTP(
    request: PhoneAuthRequest,
  ): Promise<ApiResponse<{ message: string; expiresIn: number }>> {
    return this.post('/auth/otp/request', request);
  }

  async verifyOTP(
    request: OTPVerifyRequest,
  ): Promise<ApiResponse<AuthTokens & { isNewUser: boolean }>> {
    const response = await this.post<AuthTokens & { isNewUser: boolean }>('/auth/otp/verify', {
      ...request,
      deviceId: this.deviceId,
    });
    if (response.success && response.data) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  }

  async linkQuantMail(email: string, token: string): Promise<ApiResponse<{ message: string }>> {
    return this.post('/auth/link-quantmail', { quantMailEmail: email, quantMailToken: token });
  }

  /** The authenticated user's verified profile (backend /auth/me via proxy). */
  async getMe(): Promise<ApiResponse<MeView>> {
    return this.get('/auth/userinfo');
  }

  async getProfile(): Promise<
    ApiResponse<{ id: string; phoneNumber: string; username: string; displayName: string }>
  > {
    return this.get('/auth/profile');
  }

  async updateProfile(data: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  }): Promise<ApiResponse<unknown>> {
    return this.put('/auth/profile', data);
  }

  async logout(): Promise<void> {
    await this.post('/auth/logout', {});
    this.accessToken = null;
    this.refreshToken = null;
  }

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    return this.get('/conversations');
  }

  async createConversation(
    participantIds: string[],
    name?: string,
    type: 'direct' | 'group' = 'direct',
  ): Promise<ApiResponse<Conversation>> {
    // The backend createConversationSchema REQUIRES `type` ('direct' | 'group');
    // without it the request 400s, so default to 'direct' for 1:1 chats.
    return this.post('/conversations', { participantIds, name, type });
  }

  /**
   * Search the user directory for contact discovery (New-chat picker).
   * GET /users/search?q=... — excludes the current user, ACTIVE accounts only.
   */
  async searchUsers(query: string): Promise<ApiResponse<ChatContact[]>> {
    return this.get('/users/search', { params: { q: query } });
  }

  async getConversation(conversationId: string): Promise<ApiResponse<Conversation>> {
    return this.get(`/conversations/${conversationId}`);
  }

  async getMessages(
    conversationId: string,
    limit?: number,
    before?: string,
  ): Promise<ApiResponse<Message[]>> {
    return this.get(`/conversations/${conversationId}/messages`, { params: { limit, before } });
  }

  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<Message>> {
    return this.post(`/conversations/${request.conversationId}/messages`, request);
  }

  async editMessage(messageId: string, newContent: string): Promise<ApiResponse<Message>> {
    return this.put(`/messages/${messageId}`, { newContent });
  }

  async deleteMessage(messageId: string): Promise<ApiResponse<void>> {
    return this.delete(`/messages/${messageId}`);
  }

  async addReaction(messageId: string, emoji: string): Promise<ApiResponse<Message>> {
    return this.post(`/messages/${messageId}/reactions`, { emoji });
  }

  async removeReaction(messageId: string): Promise<ApiResponse<Message>> {
    return this.delete(`/messages/${messageId}/reactions`);
  }

  async markAsRead(conversationId: string, messageIds: string[]): Promise<ApiResponse<void>> {
    return this.post(`/conversations/${conversationId}/read`, { messageIds });
  }

  async pinMessage(messageId: string): Promise<ApiResponse<Message>> {
    return this.post(`/messages/${messageId}/pin`, {});
  }

  async setTyping(conversationId: string, isTyping: boolean): Promise<ApiResponse<void>> {
    return this.post(`/conversations/${conversationId}/typing`, { isTyping });
  }

  // --------------------------------------------------------------------------
  // Broadcast Channels (Telegram-style one-to-many)
  // --------------------------------------------------------------------------

  /** The caller's channels (owned + subscribed) with role + canPost. */
  async getChannels(): Promise<ApiResponse<SubscribedChannelView[]>> {
    return this.get('/channels');
  }

  async createChannel(name: string, description?: string): Promise<ApiResponse<ChannelView>> {
    return this.post('/channels', { name, ...(description ? { description } : {}) });
  }

  /** A channel's broadcast feed (subscribers only; chronological). */
  async getChannelMessages(
    channelId: string,
    limit?: number,
  ): Promise<ApiResponse<ChannelMessageView[]>> {
    return this.get(`/channels/${channelId}/messages`, { params: { limit } });
  }

  async subscribeChannel(channelId: string): Promise<ApiResponse<{ subscribed: true }>> {
    return this.post(`/channels/${channelId}/subscribe`, {});
  }

  async unsubscribeChannel(channelId: string): Promise<ApiResponse<{ unsubscribed: boolean }>> {
    return this.post(`/channels/${channelId}/unsubscribe`, {});
  }

  /** Publish a broadcast message (OWNER/ADMIN only; backend 403 authoritative). */
  async publishToChannel(
    channelId: string,
    content: string,
  ): Promise<ApiResponse<ChannelMessageView>> {
    return this.post(`/channels/${channelId}/publish`, { content });
  }

  async getChannelSubscriberCount(channelId: string): Promise<ApiResponse<{ count: number }>> {
    return this.get(`/channels/${channelId}/subscribers/count`);
  }

  // --------------------------------------------------------------------------
  // Presence
  // --------------------------------------------------------------------------

  /**
   * Fetch the current presence snapshot for a set of users (Requirement 11.2).
   * Returns the list of user ids currently online; the caller derives per-user
   * online/offline state and keeps it live via WebSocket presence updates.
   */
  async getPresence(userIds: string[]): Promise<ApiResponse<{ online: string[] }>> {
    return this.get('/presence', { params: { userIds: userIds.join(',') } });
  }

  // --------------------------------------------------------------------------
  // Stories
  // --------------------------------------------------------------------------

  async createStory(request: CreateStoryRequest): Promise<ApiResponse<Story>> {
    return this.post('/stories', request);
  }

  async getMyStories(): Promise<ApiResponse<Story[]>> {
    return this.get('/stories/me');
  }

  async getUserStories(userId: string): Promise<ApiResponse<Story[]>> {
    return this.get(`/stories/user/${userId}`);
  }

  async viewStory(storyId: string): Promise<ApiResponse<Story>> {
    return this.post(`/stories/${storyId}/view`, {});
  }

  async replyToStory(
    storyId: string,
    content: string,
    type?: 'text' | 'emoji' | 'snap',
  ): Promise<ApiResponse<unknown>> {
    return this.post(`/stories/${storyId}/reply`, { content, type });
  }

  async deleteStory(storyId: string): Promise<ApiResponse<void>> {
    return this.delete(`/stories/${storyId}`);
  }

  async createHighlight(title: string, storyIds: string[]): Promise<ApiResponse<StoryHighlight>> {
    return this.post('/highlights', { title, storyIds });
  }

  async getHighlights(userId: string): Promise<ApiResponse<StoryHighlight[]>> {
    return this.get(`/highlights/${userId}`);
  }

  async getCloseFriends(): Promise<ApiResponse<string[]>> {
    return this.get('/close-friends');
  }

  async setCloseFriends(friendIds: string[]): Promise<ApiResponse<unknown>> {
    return this.put('/close-friends', { friendIds });
  }

  // --------------------------------------------------------------------------
  // Snaps
  // --------------------------------------------------------------------------

  async sendSnap(request: SendSnapRequest): Promise<ApiResponse<Snap>> {
    return this.post('/snaps', request);
  }

  async openSnap(snapId: string): Promise<ApiResponse<Snap>> {
    return this.post(`/snaps/${snapId}/open`, {});
  }

  async replaySnap(snapId: string): Promise<ApiResponse<Snap>> {
    return this.post(`/snaps/${snapId}/replay`, {});
  }

  async getStreaks(): Promise<ApiResponse<SnapStreak[]>> {
    return this.get('/streaks');
  }

  async getMemories(limit?: number): Promise<ApiResponse<SnapMemory[]>> {
    return this.get('/memories', { params: { limit } });
  }

  async saveToMemories(snapId: string): Promise<ApiResponse<SnapMemory>> {
    return this.post(`/snaps/${snapId}/memories`, {});
  }

  // --------------------------------------------------------------------------
  // Calls
  // --------------------------------------------------------------------------

  async initiateCall(request: InitiateCallRequest): Promise<ApiResponse<Call>> {
    return this.post('/calls', request);
  }

  async answerCall(callId: string): Promise<ApiResponse<Call>> {
    return this.post(`/calls/${callId}/answer`, {});
  }

  async endCall(callId: string): Promise<ApiResponse<Call>> {
    return this.post(`/calls/${callId}/end`, {});
  }

  async getCallHistory(): Promise<ApiResponse<Call[]>> {
    return this.get('/calls/history');
  }

  async getICEServers(): Promise<ApiResponse<unknown>> {
    return this.get('/calls/ice-servers');
  }

  // --------------------------------------------------------------------------
  // QuantMeet (C08) — meeting rooms
  // --------------------------------------------------------------------------

  async listMeetingRooms(): Promise<ApiResponse<MeetingRoomSummary[]>> {
    return this.get('/meetings/rooms');
  }

  async createMeetingRoom(
    request: CreateMeetingRoomRequest,
  ): Promise<ApiResponse<MeetingRoomSummary>> {
    return this.post('/meetings/rooms', request);
  }

  async getMeetingRoom(roomId: string): Promise<ApiResponse<MeetingRoomSummary>> {
    return this.get(`/meetings/rooms/${encodeURIComponent(roomId)}`);
  }

  async joinMeetingRoom(
    roomId: string,
    request: JoinMeetingRoomRequest,
  ): Promise<ApiResponse<JoinMeetingRoomResponse>> {
    return this.post(`/meetings/rooms/${encodeURIComponent(roomId)}/join`, request);
  }

  async leaveMeetingRoom(roomId: string): Promise<ApiResponse<MeetingRoomSummary>> {
    return this.post(`/meetings/rooms/${encodeURIComponent(roomId)}/leave`, {});
  }

  async closeMeetingRoom(roomId: string): Promise<ApiResponse<MeetingRoomSummary>> {
    return this.post(`/meetings/rooms/${encodeURIComponent(roomId)}/close`, {});
  }

  // --------------------------------------------------------------------------
  // Groups
  // --------------------------------------------------------------------------

  async createGroup(request: CreateGroupRequest): Promise<ApiResponse<Group>> {
    return this.post('/groups', request);
  }

  async getGroups(): Promise<ApiResponse<Group[]>> {
    return this.get('/groups');
  }

  async getGroup(groupId: string): Promise<ApiResponse<Group>> {
    return this.get(`/groups/${groupId}`);
  }

  async joinGroup(code: string): Promise<ApiResponse<Group>> {
    return this.post('/groups/join', { code });
  }

  async leaveGroup(groupId: string): Promise<ApiResponse<void>> {
    return this.post(`/groups/${groupId}/leave`, {});
  }

  // --------------------------------------------------------------------------
  // Discover
  // --------------------------------------------------------------------------

  async getDiscoverFeed(category?: string): Promise<ApiResponse<DiscoverItem[]>> {
    return this.get('/discover', { params: { category } });
  }

  async getTrendingContent(): Promise<ApiResponse<DiscoverItem[]>> {
    return this.get('/discover/trending');
  }

  async getPublishers(): Promise<ApiResponse<Publisher[]>> {
    return this.get('/discover/publishers');
  }

  async subscribe(publisherId: string): Promise<ApiResponse<unknown>> {
    return this.post(`/discover/publishers/${publisherId}/subscribe`, {});
  }

  // --------------------------------------------------------------------------
  // AR Filters
  // --------------------------------------------------------------------------

  async getFilters(options?: {
    type?: string;
    category?: string;
    trending?: boolean;
  }): Promise<ApiResponse<ARFilter[]>> {
    return this.get('/filters', { params: options as Record<string, string> });
  }

  async getTrendingFilters(): Promise<ApiResponse<ARFilter[]>> {
    return this.get('/filters/trending');
  }

  async applyFilter(
    filterId: string,
    imageData: string,
  ): Promise<ApiResponse<{ processedUrl: string }>> {
    return this.post(`/filters/${filterId}/apply`, { imageData });
  }

  // --------------------------------------------------------------------------
  // AI
  // --------------------------------------------------------------------------

  async getSmartReplies(message: string): Promise<ApiResponse<SmartReply[]>> {
    return this.post('/ai/smart-replies', { message });
  }

  async translateMessage(
    text: string,
    targetLanguage: string,
  ): Promise<ApiResponse<TranslationResult>> {
    return this.post('/ai/translate', { text, targetLanguage });
  }

  async chatWithAI(message: string): Promise<ApiResponse<{ response: string }>> {
    return this.post('/ai/chat', { message });
  }

  // --------------------------------------------------------------------------
  // Bitmoji
  // --------------------------------------------------------------------------

  async getBitmoji(): Promise<ApiResponse<Bitmoji>> {
    return this.get('/bitmoji/me');
  }

  async createBitmoji(options: Partial<Bitmoji>): Promise<ApiResponse<Bitmoji>> {
    return this.post('/bitmoji', options);
  }

  async updateBitmoji(options: Partial<Bitmoji>): Promise<ApiResponse<Bitmoji>> {
    return this.put('/bitmoji', options);
  }

  // --------------------------------------------------------------------------
  // Map
  // --------------------------------------------------------------------------

  async updateLocation(request: LocationUpdateRequest): Promise<ApiResponse<FriendLocation>> {
    return this.post('/map/location', request);
  }

  async getFriendLocations(friendIds: string[]): Promise<ApiResponse<FriendLocation[]>> {
    return this.post('/map/friends', { friendIds });
  }

  async getNearbyPlaces(lat: number, lng: number, radius?: number): Promise<ApiResponse<Place[]>> {
    return this.get('/map/places', { params: { lat, lng, radius } });
  }

  async setGhostMode(enabled: boolean): Promise<ApiResponse<void>> {
    return this.post('/map/ghost-mode', { enabled });
  }

  // --------------------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------------------

  async getNotifications(limit?: number): Promise<ApiResponse<Notification[]>> {
    return this.get('/notifications', { params: { limit } });
  }

  // --------------------------------------------------------------------------
  // HTTP Methods
  // --------------------------------------------------------------------------

  private async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request('GET', path, undefined, options);
  }

  private async post<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request('POST', path, body, options);
  }

  private async put<T>(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request('PUT', path, body, options);
  }

  private async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request('DELETE', path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;

    if (options?.params) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) params.set(key, String(value));
      }
      const paramStr = params.toString();
      if (paramStr) url += `?${paramStr}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-ID': this.deviceId,
      ...options?.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const timeout = options?.timeout ?? REQUEST_TIMEOUT_MS;

    try {
      const response = await apiFetchRaw(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal,
        timeout,
      });

      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await apiFetchRaw(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: options?.signal,
            timeout,
          });
          return (await retryResponse.json()) as ApiResponse<T>;
        }
        this.onAuthError?.();
        return {
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Authentication failed', statusCode: 401 },
        };
      }

      // A non-JSON body (e.g. an HTML error page from the edge/Next 404 when a
      // proxy route is missing) must surface as the real HTTP failure, never as
      // a misleading "Network request failed".
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {
          success: false,
          error: {
            code: response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR',
            message: `Request failed with status ${response.status}`,
            statusCode: response.status,
          },
        };
      }

      const data = (await response.json()) as ApiResponse<T>;
      return data;
    } catch (error) {
      // Surface the real failure, sanitized — never swallow it into a blanket
      // "Network request failed". A timeout abort (apiFetchRaw's ceiling
      // above) gets its own code so UIs can say "timed out" and offer retry;
      // a caller-initiated abort is reported as a cancellation, not an error
      // pretending the network failed.
      if (options?.signal?.aborted) {
        return {
          success: false,
          error: { code: 'ABORTED', message: 'Request cancelled', statusCode: 0 },
        };
      }
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError');
      if (timedOut) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out. Please try again.',
            statusCode: 0,
          },
        };
      }
      const message = sanitizeErrorMessage(error);
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: message || 'Network request failed',
          statusCode: 0,
        },
      };
    }
  }

  private async refreshTokens(): Promise<boolean> {
    try {
      const response = await apiFetchRaw(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken, deviceId: this.deviceId }),
        timeout: REQUEST_TIMEOUT_MS,
      });

      const data = (await response.json()) as ApiResponse<AuthTokens>;
      if (data.success && data.data) {
        this.accessToken = data.data.accessToken;
        this.refreshToken = data.data.refreshToken;
        this.onTokenRefresh?.(data.data);
        return true;
      }
    } catch {}
    return false;
  }

  private generateDeviceId(): string {
    return `device_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  }
}

export const apiClient = new QuantChatApiClient();
