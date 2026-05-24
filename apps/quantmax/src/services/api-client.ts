// ============================================================================
// QuantMax - Frontend API Client
// ============================================================================

import type { ShortVideo, UserProfile, Match, Message, VideoChat, VideoChatPreferences, MatchAction, SafetyReport, LiveEvent } from '../types';

const API_BASE = '/api';

interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string } }

class QuantMaxApiClient {
  private token: string = '';
  setToken(token: string): void { this.token = token; }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }

  // Feed
  async getForYouFeed(limit?: number): Promise<ApiResponse<ShortVideo[]>> { return this.request('GET', `/feed/for-you?limit=${limit || 20}`); }
  async getTrending(): Promise<ApiResponse<ShortVideo[]>> { return this.request('GET', '/feed/trending'); }
  async recordEngagement(videoId: string, data: any): Promise<ApiResponse<void>> { return this.request('POST', '/feed/engagement', { videoId, ...data }); }

  // Create
  async createVideo(data: any): Promise<ApiResponse<ShortVideo>> { return this.request('POST', '/create/video', data); }
  async createDuet(parentVideoId: string, data: any): Promise<ApiResponse<ShortVideo>> { return this.request('POST', '/create/duet', { parentVideoId, ...data }); }

  // Video Chat
  async joinVideoChat(preferences: VideoChatPreferences): Promise<ApiResponse<{ chatId: string | null; status: string }>> { return this.request('POST', '/videochat/join', preferences); }
  async skipVideoChat(): Promise<ApiResponse<any>> { return this.request('POST', '/videochat/skip'); }
  async endVideoChat(): Promise<ApiResponse<void>> { return this.request('POST', '/videochat/end'); }
  async sendChatMessage(content: string): Promise<ApiResponse<void>> { return this.request('POST', '/videochat/message', { content }); }

  // Matching
  async getRecommendations(limit?: number): Promise<ApiResponse<UserProfile[]>> { return this.request('GET', `/matching/recommendations?limit=${limit || 20}`); }
  async swipe(targetId: string, action: MatchAction): Promise<ApiResponse<{ matched: boolean; match?: Match }>> { return this.request('POST', '/matching/swipe', { targetId, action }); }
  async getMatches(): Promise<ApiResponse<Match[]>> { return this.request('GET', '/matching/matches'); }
  async unmatch(matchId: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/matching/matches/${matchId}`); }

  // Messages
  async getMessages(matchId: string): Promise<ApiResponse<Message[]>> { return this.request('GET', `/messages/${matchId}`); }
  async sendMessage(matchId: string, content: string, type?: string): Promise<ApiResponse<Message>> { return this.request('POST', `/messages/${matchId}`, { content, type }); }

  // Profile
  async getMyProfile(): Promise<ApiResponse<UserProfile>> { return this.request('GET', '/profiles/me'); }
  async createProfile(data: any): Promise<ApiResponse<UserProfile>> { return this.request('POST', '/profiles', data); }
  async updateProfile(data: any): Promise<ApiResponse<UserProfile>> { return this.request('PUT', '/profiles/me', data); }
  async addPhoto(url: string): Promise<ApiResponse<any>> { return this.request('POST', '/profiles/me/photos', { url }); }

  // Safety
  async reportUser(reportedUserId: string, reason: string, description: string): Promise<ApiResponse<SafetyReport>> { return this.request('POST', '/safety/report', { reportedUserId, reason, description }); }
  async blockUser(userId: string): Promise<ApiResponse<void>> { return this.request('POST', `/safety/block/${userId}`); }
  async verify(type: string): Promise<ApiResponse<any>> { return this.request('POST', '/safety/verify', { type }); }

  // Live
  async goLive(title: string, type: string): Promise<ApiResponse<LiveEvent>> { return this.request('POST', '/live/start', { title, type }); }
  async getLiveStreams(): Promise<ApiResponse<LiveEvent[]>> { return this.request('GET', '/live'); }
  async joinStream(streamId: string): Promise<ApiResponse<any>> { return this.request('POST', `/live/${streamId}/join`); }
}

export const apiClient = new QuantMaxApiClient();
export default apiClient;
