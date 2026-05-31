// ============================================================================
// QuantTube - Frontend API Client
// Handles all API communication with the QuantTube backend
// ============================================================================

import type {
  Video,
  Track,
  Album,
  Artist,
  Show,
  Channel,
  Playlist,
  LiveStream,
  SearchResult,
  Recommendation,
} from '../types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; statusCode: number };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
}

class QuantTubeApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }
  clearToken(): void {
    this.token = null;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { method = 'GET', body, params, headers = {} } = options;
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => searchParams.append(k, String(v)));
      url += `?${searchParams.toString()}`;
    }
    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
    if (this.token) reqHeaders['Authorization'] = `Bearer ${this.token}`;

    const response = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json() as Promise<ApiResponse<T>>;
  }

  // Videos
  async uploadVideo(data: {
    title: string;
    description?: string;
    type?: string;
    tags?: string[];
    totalChunks?: number;
  }) {
    return this.request('/videos/upload', { method: 'POST', body: data });
  }
  async getVideos(params?: { page?: number; limit?: number; category?: string }) {
    return this.request<{ videos: Video[] }>('/videos', { params: params as any });
  }
  async getTrending() {
    return this.request<{ videos: Video[] }>('/videos/trending');
  }
  async getShorts() {
    return this.request<{ shorts: Video[] }>('/videos/shorts');
  }
  async getVideo(id: string) {
    return this.request<{ video: Video }>(`/videos/${id}`);
  }
  async streamVideo(id: string, quality?: string) {
    return this.request(`/videos/${id}/stream`, { params: quality ? { quality } : undefined });
  }
  async getManifest(id: string) {
    return this.request(`/videos/${id}/manifest`);
  }
  async getChapters(id: string) {
    return this.request(`/videos/${id}/chapters`);
  }
  async getSubtitles(id: string) {
    return this.request(`/videos/${id}/subtitles`);
  }
  async updateVideo(id: string, data: Partial<Video>) {
    return this.request(`/videos/${id}`, { method: 'PUT', body: data });
  }
  async deleteVideo(id: string) {
    return this.request(`/videos/${id}`, { method: 'DELETE' });
  }

  // Music
  async getMusicHome() {
    return this.request('/music');
  }
  async getTracks(params?: { genre?: string }) {
    return this.request<{ tracks: Track[] }>('/music/tracks', { params: params as any });
  }
  async getTrack(id: string) {
    return this.request<{ track: Track }>(`/music/tracks/${id}`);
  }
  async streamTrack(id: string, quality?: string) {
    return this.request(`/music/tracks/${id}/stream`, {
      params: quality ? { quality } : undefined,
    });
  }
  async getLyrics(id: string) {
    return this.request(`/music/tracks/${id}/lyrics`);
  }
  async getAlbums(params?: { genre?: string }) {
    return this.request<{ albums: Album[] }>('/music/albums', { params: params as any });
  }
  async getAlbum(id: string) {
    return this.request<{ album: Album }>(`/music/albums/${id}`);
  }
  async getArtists() {
    return this.request<{ artists: Artist[] }>('/music/artists');
  }
  async getArtist(id: string) {
    return this.request<{ artist: Artist }>(`/music/artists/${id}`);
  }
  async getQueue() {
    return this.request('/music/queue');
  }
  async addToQueue(trackId: string) {
    return this.request('/music/queue', { method: 'POST', body: { trackId } });
  }

  // Shows
  async getShows(params?: { genre?: string }) {
    return this.request<{ shows: Show[] }>('/shows', { params: params as any });
  }
  async getShow(id: string) {
    return this.request<{ show: Show }>(`/shows/${id}`);
  }
  async getSeasons(showId: string) {
    return this.request(`/shows/${showId}/seasons`);
  }
  async streamEpisode(showId: string, episodeId: string) {
    return this.request(`/shows/${showId}/episodes/${episodeId}/stream`);
  }
  async updateProgress(
    showId: string,
    data: { episodeId: string; position: number; duration: number },
  ) {
    return this.request(`/shows/${showId}/progress`, { method: 'POST', body: data });
  }

  // Channels
  async getChannel(id: string) {
    return this.request<{
      channel: Channel;
      videos?: {
        id: string;
        title: string;
        thumbnail: string;
        views: number;
        publishedAt: string;
        duration: number;
        isLive: boolean;
        isShort: boolean;
      }[];
      playlists?: {
        id: string;
        title: string;
        thumbnail: string;
        videoCount: number;
        updatedAt: string;
      }[];
      communityPosts?: {
        id: string;
        content: string;
        postedAt: string;
        likes: number;
        comments: number;
        imageUrl?: string;
      }[];
    }>(`/channels/${id}`);
  }
  async subscribe(channelId: string) {
    return this.request(`/channels/${channelId}/subscribe`, { method: 'POST' });
  }
  async unsubscribe(channelId: string) {
    return this.request(`/channels/${channelId}/subscribe`, { method: 'DELETE' });
  }
  async getSubscriptions() {
    return this.request('/subscriptions');
  }

  // Playlists
  async getPlaylists() {
    return this.request<{ playlists: Playlist[] }>('/playlists');
  }
  async createPlaylist(data: { title: string; type?: string; visibility?: string }) {
    return this.request('/playlists', { method: 'POST', body: data });
  }
  async addToPlaylist(playlistId: string, data: { contentId: string; contentType: string }) {
    return this.request(`/playlists/${playlistId}/items`, { method: 'POST', body: data });
  }

  // Live
  async getLiveStreams() {
    return this.request<{ streams: LiveStream[] }>('/live');
  }
  async getStream(id: string) {
    return this.request<{ stream: LiveStream }>(`/live/${id}`);
  }
  async watchStream(id: string) {
    return this.request(`/live/${id}/watch`);
  }
  async sendChat(streamId: string, message: string) {
    return this.request(`/live/${streamId}/chat`, { method: 'POST', body: { message } });
  }

  // Interactions
  async like(contentId: string) {
    return this.request('/interactions/like', { method: 'POST', body: { contentId } });
  }
  async comment(contentId: string, text: string) {
    return this.request('/interactions/comment', { method: 'POST', body: { contentId, text } });
  }
  async getComments(contentId: string) {
    return this.request(`/interactions/comments/${contentId}`);
  }
  async addToWatchLater(contentId: string) {
    return this.request('/interactions/watch-later', { method: 'POST', body: { contentId } });
  }
  async getHistory() {
    return this.request('/interactions/history');
  }

  // Search
  async search(query: string, type?: string) {
    return this.request<{ results: SearchResult[] }>('/search', {
      params: { q: query, ...(type && { type }) },
    });
  }
  async autocomplete(query: string) {
    return this.request('/search/autocomplete', { params: { q: query } });
  }

  // AI
  async getRecommendations(type?: string) {
    return this.request<{ recommendations: Recommendation[] }>('/ai/recommendations', {
      params: type ? { type } : undefined,
    });
  }
  async getPersonalizedFeed() {
    return this.request('/ai/recommendations/personalized');
  }
}

export const apiClient = new QuantTubeApiClient();
export default QuantTubeApiClient;
