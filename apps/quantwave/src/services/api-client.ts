// ============================================================================
// QuantSync - Frontend API Client
// Typed API client for all QuantSync endpoints
// ============================================================================

import type {
  Post,
  Comment,
  Community,
  Space,
  FeedMode,
  TrendingTopic,
  SearchResult,
  Notification,
  NotificationPreferences,
  AIContentSuggestion,
  FactCheck,
  ApiResponse,
} from '../types';
import { apiFetchRaw } from '@quant/api-client';

const API_BASE = '/api';

/** Shape of a profile row returned by GET /radar/nearby (backend: ProximityRadarService). */
export interface RadarProfile {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  distanceKm: number;
  bio: string | null;
  interests: string[];
  mutualMatch: boolean;
}

// ============================================================================
// Auth dead-end guard.
// The backend answers HTTP 401 when the session is missing or expired. Its raw
// message ("Missing or invalid authorization header", ...) must never reach the
// screen: on 401 we drop the token, notify the auth layer (which bounces the
// visitor to /login via AuthGuard), and throw a typed error. All other backend
// failure messages are replaced with curated, user-safe text — the
// machine-readable `code` is preserved for debugging.
// ============================================================================

/** Thrown when the backend rejects the session (HTTP 401). Never carries backend text. */
export class AuthRequiredError extends Error {
  constructor() {
    super('Please sign in to continue.');
    this.name = 'AuthRequiredError';
  }
}

type UnauthorizedListener = () => void;

/** Curated, user-safe replacement for raw backend error text. */
function friendlyErrorMessage(status: number): string {
  if (status === 400 || status === 422) return 'Please check your input and try again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 409) return 'That conflicts with existing data. Please try again.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return 'Something went wrong. Please try again.';
}

class QuantSyncAPI {
  private accessToken: string | null = null;
  private anonymousMode: boolean = false;
  private unauthorizedListeners = new Set<UnauthorizedListener>();

  setToken(token: string): void {
    this.accessToken = token;
  }
  clearToken(): void {
    this.accessToken = null;
  }
  setAnonymousMode(enabled: boolean): void {
    this.anonymousMode = enabled;
  }

  /**
   * Registers a listener fired when the backend answers 401 (the session is
   * dead). Returns an unsubscribe function.
   */
  onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);
    return () => {
      this.unauthorizedListeners.delete(listener);
    };
  }

  private handleUnauthorized(): void {
    this.accessToken = null;
    for (const listener of this.unauthorizedListeners) {
      try {
        listener();
      } catch {
        // A listener must never break the API client.
      }
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    if (this.anonymousMode) headers['X-Anonymous-Mode'] = 'true';

    const response = await apiFetchRaw(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Session is missing/expired: never surface the backend's raw 401 text.
    // Drop the token, tell the auth layer (AuthGuard redirects to /login),
    // and throw a typed error the UI can recognise.
    if (response.status === 401) {
      this.handleUnauthorized();
      throw new AuthRequiredError();
    }

    const json = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!json || typeof json !== 'object') {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Something went wrong. Please try again.',
          statusCode: 502,
        },
      };
    }

    // Never leak raw backend text to the UI: keep the machine-readable code
    // for debugging, but replace the human message with curated text.
    if (!json.success && json.error) {
      const statusCode = json.error.statusCode || response.status;
      json.error = {
        code: json.error.code,
        message: friendlyErrorMessage(statusCode),
        statusCode,
      };
    }
    return json;
  }

  // --- Auth ---
  async loginWithSSO(quantMailToken: string) {
    return this.request<{ accessToken: string; user: any }>('POST', '/auth/sso/login', {
      quantMailToken,
    });
  }
  async toggleAnonymous(enabled: boolean) {
    return this.request<{ isAnonymous: boolean; anonymousAlias?: string }>(
      'POST',
      '/auth/anonymous/toggle',
      { enabled },
    );
  }
  async getSession() {
    return this.request<any>('GET', '/auth/session');
  }
  async refreshToken(refreshToken: string) {
    return this.request<{ accessToken: string }>('POST', '/auth/refresh', { refreshToken });
  }
  async logout() {
    return this.request<void>('POST', '/auth/logout');
  }

  // --- Posts ---
  async createPost(data: {
    content: string;
    type?: string;
    mediaAttachments?: any[];
    poll?: any;
    communityId?: string;
    hashtags?: string[];
    space?: 'main' | 'verified' | 'anonymous';
  }) {
    return this.request<Post>('POST', '/posts', data);
  }
  async getPost(id: string) {
    return this.request<Post>('GET', `/posts/${id}`);
  }
  async editPost(id: string, data: { content?: string; hashtags?: string[] }) {
    return this.request<Post>('PUT', `/posts/${id}`, data);
  }
  async deletePost(id: string) {
    return this.request<void>('DELETE', `/posts/${id}`);
  }
  async repost(postId: string) {
    return this.request<Post>('POST', '/posts/repost', { postId });
  }
  async quotePost(postId: string, content: string) {
    return this.request<Post>('POST', '/posts/quote', { postId, content });
  }
  async getUserPosts(userId: string) {
    return this.request<Post[]>('GET', `/posts/user/${userId}`);
  }
  async votePoll(postId: string, optionIndex: number) {
    return this.request<unknown>('POST', `/posts/${postId}/poll/vote`, { optionIndex });
  }

  // --- Feed ---
  async getFeed(mode: FeedMode = 'for-you', cursor?: string, limit?: number) {
    const params = new URLSearchParams({ mode });
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    return this.request<Post[]>('GET', `/feed?${params}`);
  }
  async getForYouFeed(cursor?: string) {
    return this.request<Post[]>('GET', `/feed/for-you${cursor ? `?cursor=${cursor}` : ''}`);
  }
  async getFollowingFeed(cursor?: string) {
    return this.request<Post[]>('GET', `/feed/following${cursor ? `?cursor=${cursor}` : ''}`);
  }
  async getTrendingFeed(cursor?: string) {
    return this.request<Post[]>('GET', `/feed/trending${cursor ? `?cursor=${cursor}` : ''}`);
  }
  async trackEngagement(postId: string, type: string, duration?: number) {
    return this.request<void>('POST', '/feed/engagement', { postId, type, duration });
  }

  // --- Communities ---
  async createCommunity(data: {
    name: string;
    displayName: string;
    description: string;
    category: string;
  }) {
    return this.request<Community>('POST', '/communities', data);
  }
  async getCommunity(id: string) {
    return this.request<Community>('GET', `/communities/${id}`);
  }
  async listCommunities(params?: { category?: string; sort?: string }) {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return this.request<Community[]>('GET', `/communities${query}`);
  }
  async joinCommunity(id: string) {
    return this.request<void>('POST', `/communities/${id}/join`);
  }
  async leaveCommunity(id: string) {
    return this.request<void>('POST', `/communities/${id}/leave`);
  }

  // --- Interactions ---
  async upvote(id: string, targetType: 'post' | 'comment' = 'post') {
    return this.request<{ vote: string | null }>('POST', `/interactions/${id}/upvote`, {
      targetType,
    });
  }
  async downvote(id: string, targetType: 'post' | 'comment' = 'post') {
    return this.request<{ vote: string | null }>('POST', `/interactions/${id}/downvote`, {
      targetType,
    });
  }
  async bookmark(id: string) {
    return this.request<{ bookmarked: boolean }>('POST', `/interactions/${id}/bookmark`);
  }
  async share(id: string) {
    return this.request<void>('POST', `/interactions/${id}/share`);
  }
  async getBookmarks() {
    return this.request<Post[]>('GET', '/interactions/bookmarks');
  }
  async createComment(postId: string, content: string, parentId?: string) {
    return this.request<Comment>('POST', `/posts/${postId}/comments`, { content, parentId });
  }
  async getComments(postId: string, sort?: string) {
    return this.request<Comment[]>(
      'GET',
      `/posts/${postId}/comments${sort ? `?sort=${sort}` : ''}`,
    );
  }

  // --- Trending & Search ---
  async getTrending(category?: string) {
    return this.request<TrendingTopic[]>(
      'GET',
      `/trending${category ? `?category=${category}` : ''}`,
    );
  }
  async getExplore() {
    return this.request<any>('GET', '/explore');
  }
  async search(q: string, type?: string, sort?: string) {
    const params = new URLSearchParams({ q });
    if (type) params.set('type', type);
    if (sort) params.set('sort', sort);
    return this.request<SearchResult[]>('GET', `/search?${params}`);
  }
  async getSuggestions(q: string) {
    return this.request<string[]>('GET', `/search/suggestions?q=${q}`);
  }

  // --- Spaces ---
  async createSpace(data: { title: string; topics?: string[]; scheduledAt?: string }) {
    return this.request<Space>('POST', '/spaces', data);
  }
  async getSpace(id: string) {
    return this.request<Space>('GET', `/spaces/${id}`);
  }
  async listLiveSpaces() {
    return this.request<Space[]>('GET', '/spaces/live');
  }
  async joinSpace(id: string) {
    return this.request<void>('POST', `/spaces/${id}/join`);
  }
  async leaveSpace(id: string) {
    return this.request<void>('POST', `/spaces/${id}/leave`);
  }
  async raiseHand(id: string) {
    return this.request<void>('POST', `/spaces/${id}/raise-hand`);
  }

  // --- Anonymous ---
  async createAnonymousPost(content: string, category?: string) {
    return this.request<Post>('POST', '/anonymous/posts', {
      content,
      confessionCategory: category,
    });
  }
  async getAnonymousFeed(sort?: string, category?: string) {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (category) params.set('category', category);
    return this.request<Post[]>('GET', `/anonymous/feed?${params}`);
  }
  async reactToAnonymousPost(id: string, reaction: string) {
    return this.request<void>('POST', `/anonymous/posts/${id}/react`, { reaction });
  }

  // --- AI ---
  async getAISuggestions(type: string, params?: Record<string, string>) {
    const query = new URLSearchParams({ type, ...params });
    return this.request<AIContentSuggestion[]>('GET', `/ai/suggestions?${query}`);
  }
  async factCheck(postId: string, content: string) {
    return this.request<FactCheck>('POST', '/ai/fact-check', { postId, content });
  }

  // --- Notifications ---
  async getNotifications(unread?: boolean) {
    return this.request<Notification[]>('GET', `/notifications${unread ? '?unread=true' : ''}`);
  }
  async markNotificationsRead(ids?: string[]) {
    return this.request<void>(
      'POST',
      '/notifications/read',
      ids ? { notificationIds: ids } : { markAll: true },
    );
  }
  async getNotificationPreferences() {
    return this.request<NotificationPreferences>('GET', '/notifications/preferences');
  }
  async updateNotificationPreferences(prefs: Partial<NotificationPreferences>) {
    return this.request<NotificationPreferences>('PUT', '/notifications/preferences', prefs);
  }

  // --- Proximity Radar ---
  // Identity is established by the session's Bearer token (Authorization
  // header), exactly like every other route — never a client-supplied
  // identity header. The backend answers 401 when there is no valid session.
  async getRadarNearby(lat: number, lon: number, radiusKm: number, maxResults?: number) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm),
    });
    if (maxResults) params.set('maxResults', String(maxResults));
    return this.request<RadarProfile[]>('GET', `/radar/nearby?${params}`);
  }
  async radarSwipe(targetUserId: string, action: 'like' | 'pass' | 'superlike') {
    return this.request<{ matched: boolean; matchId?: string }>('POST', '/radar/swipe', {
      targetUserId,
      action,
    });
  }
}

export const quantSyncAPI = new QuantSyncAPI();
export default QuantSyncAPI;

