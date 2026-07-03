// ============================================================================
// QuantChat - Frontend API Client
// ============================================================================

import type {
  Message,
  Conversation,
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
  ): Promise<ApiResponse<Conversation>> {
    return this.post('/conversations', { participantIds, name });
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

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      });

      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          return (await retryResponse.json()) as ApiResponse<T>;
        }
        this.onAuthError?.();
        return {
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Authentication failed', statusCode: 401 },
        };
      }

      const data = (await response.json()) as ApiResponse<T>;
      return data;
    } catch (error) {
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Network request failed', statusCode: 0 },
      };
    }
  }

  private async refreshTokens(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken, deviceId: this.deviceId }),
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
