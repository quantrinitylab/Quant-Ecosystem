// ============================================================================
// QuantNeon - Frontend API Client
// ============================================================================

import type { Post, Reel, Story, Profile, Game, Product, ARFilter, Comment } from '../types';

/** Mirrors the backend DmService shapes (apps/quantneon/backend/services/dm.service.ts). */
export interface DmParticipant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}
export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
}
export interface DmConversationSummary {
  id: string;
  type: string;
  name: string | null;
  isGroup: boolean;
  memberIds: string[];
  participants: DmParticipant[];
  lastMessage: DmMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

class QuantNeonApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }
  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', body, params } = options;
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const sp = new URLSearchParams(params);
      url += `?${sp.toString()}`;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json() as Promise<ApiResponse<T>>;
  }

  // Posts
  async createPost(data: any) {
    return this.request<{ post: Post }>('/api/posts', { method: 'POST', body: data });
  }
  async getFeed(page?: number) {
    return this.request<{
      posts: Post[];
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
    }>('/api/posts/feed', {
      params: page ? { page: String(page) } : undefined,
    });
  }
  async getPost(id: string) {
    return this.request<{ post: Post }>(`/api/posts/${id}`);
  }
  async getUserPosts(userId: string, page?: number) {
    return this.request<{ posts: Post[]; total: number; hasMore: boolean }>(
      `/api/posts/user/${userId}`,
      { params: page ? { page: String(page) } : undefined },
    );
  }
  async getSavedPosts(page?: number) {
    return this.request<{ posts: Post[]; total: number; hasMore: boolean }>('/api/posts/saved', {
      params: page ? { page: String(page) } : undefined,
    });
  }
  async likePost(id: string) {
    return this.request<{ liked: boolean; likeCount: number }>(`/api/posts/${id}/like`, {
      method: 'POST',
    });
  }
  async savePost(id: string) {
    return this.request<{ saved: boolean }>(`/api/posts/${id}/save`, { method: 'POST' });
  }
  async commentOnPost(id: string, text: string) {
    return this.request<{ comment: Comment }>(`/api/posts/${id}/comment`, {
      method: 'POST',
      body: { text },
    });
  }
  async getPostComments(id: string) {
    return this.request<{ comments: Comment[] }>(`/api/posts/${id}/comments`);
  }

  // Reels
  async getReelsFeed() {
    return this.request<{ reels: Reel[] }>('/api/reels/feed');
  }
  async createReel(data: any) {
    return this.request<{ reel: Reel }>('/api/reels', { method: 'POST', body: data });
  }
  async likeReel(id: string) {
    return this.request<{ liked: boolean; likeCount: number }>(`/api/reels/${id}/like`, {
      method: 'POST',
    });
  }
  async commentOnReel(id: string, text: string) {
    return this.request<{ comment: Comment }>(`/api/reels/${id}/comment`, {
      method: 'POST',
      body: { text },
    });
  }
  async getReelComments(id: string) {
    return this.request<{ comments: Comment[] }>(`/api/reels/${id}/comments`);
  }

  // Stories
  async createStory(data: any) {
    return this.request('/api/stories', { method: 'POST', body: data });
  }
  async getStoriesFeed() {
    return this.request('/api/stories/feed');
  }
  async viewStory(id: string) {
    return this.request(`/api/stories/${id}/view`, { method: 'POST' });
  }

  // Profiles
  async getProfile(id: string) {
    return this.request<{ profile: Profile }>(`/api/profiles/${id}`);
  }
  async follow(id: string) {
    return this.request<{ following: boolean }>(`/api/profiles/${id}/follow`, { method: 'POST' });
  }
  async unfollow(id: string) {
    return this.request<{ following: boolean }>(`/api/profiles/${id}/follow`, { method: 'DELETE' });
  }
  async updateProfile(data: {
    bio?: string;
    website?: string;
    displayName?: string;
    avatarUrl?: string;
  }) {
    return this.request<{ profile: Profile }>('/api/profiles/me', { method: 'PATCH', body: data });
  }
  async listCloseFriends() {
    return this.request<{
      friends: Array<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
      }>;
    }>('/api/profiles/close-friends');
  }
  async toggleCloseFriend(id: string, add: boolean) {
    return this.request<{ isCloseFriend: boolean }>(`/api/profiles/${id}/close-friend`, {
      method: add ? 'POST' : 'DELETE',
    });
  }

  // Notifications
  async getNotifications(page?: number) {
    return this.request<{
      notifications: Array<{
        id: string;
        type: string;
        fromUser: string;
        fromAvatar: string | null;
        title: string;
        content: string;
        read: boolean;
        sourceEntityId: string | null;
        createdAt: string;
      }>;
    }>('/api/notifications', { params: page ? { page: String(page) } : undefined });
  }
  async getUnreadCount() {
    return this.request<{ count: number }>('/api/notifications/unread-count');
  }
  async markAllRead() {
    return this.request<{ count: number }>('/api/notifications/read-all', { method: 'POST' });
  }
  async markNotificationRead(id: string) {
    return this.request<{ count: number }>(`/api/notifications/${id}/read`, { method: 'POST' });
  }

  // Games
  async getGames() {
    return this.request<{ games: Game[] }>('/api/games');
  }
  async startGame(id: string) {
    return this.request(`/api/games/${id}/start`, { method: 'POST' });
  }
  async gameAction(id: string, action: string, data: any) {
    return this.request(`/api/games/${id}/action`, { method: 'POST', body: { action, data } });
  }

  // Shopping
  async getProducts() {
    return this.request<{ products: Product[] }>('/api/shopping/products');
  }
  async addToCart(productId: string, quantity: number) {
    return this.request('/api/shopping/cart', { method: 'POST', body: { productId, quantity } });
  }
  async checkout() {
    return this.request('/api/shopping/checkout', { method: 'POST' });
  }

  // AR/VR
  async getARFilters() {
    return this.request<{ filters: ARFilter[] }>('/api/ar/filters');
  }
  async processAR(mediaUrl: string, filterId: string) {
    return this.request('/api/ar/process', { method: 'POST', body: { mediaUrl, filterId } });
  }

  // Explore
  async getExploreFeed() {
    return this.request<{ posts: Post[] }>('/api/explore');
  }
  async search(query: string) {
    return this.request<{
      users: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>;
      posts: Post[];
    }>('/api/explore/search', { params: { q: query } });
  }

  // AI
  async suggestHashtags(caption: string) {
    return this.request<{ hashtags: string[] }>('/api/ai/hashtags/suggest', {
      method: 'POST',
      body: { caption },
    });
  }
  async generateCaption(input: {
    mediaUrl?: string;
    description?: string;
    mood?: 'aesthetic' | 'funny' | 'minimal' | 'poetic';
    count?: number;
  }) {
    return this.request<{ captions: string[] }>('/api/ai/caption/generate', {
      method: 'POST',
      body: input,
    });
  }

  // Direct Messages
  async getMe() {
    return this.request<{ profile: Profile }>('/api/profiles/me');
  }
  async listConversations() {
    return this.request<DmConversationSummary[]>('/api/dm/conversations');
  }
  async startDirectConversation(userId: string) {
    return this.request<DmConversationSummary>('/api/dm/conversations', {
      method: 'POST',
      body: { userId },
    });
  }
  async getDmMessages(conversationId: string) {
    return this.request<DmMessage[]>(`/api/dm/conversations/${conversationId}/messages`);
  }
  async sendDmMessage(conversationId: string, content: string) {
    return this.request<DmMessage>(`/api/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content },
    });
  }
  async markDmRead(conversationId: string) {
    return this.request<{ lastReadAt: string }>(`/api/dm/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  }
}

export const apiClient = new QuantNeonApiClient();
export default QuantNeonApiClient;
