// ============================================================================
// QuantAds - Frontend API Client
// ============================================================================

import type {
  Campaign,
  Creative,
  CampaignMetrics,
  AnalyticsReport,
  Invoice,
  PaymentMethod,
  CustomAudience,
  ApiResponse,
} from '../types';

const API_BASE = '/api';

class QuantAdsAPI {
  private accessToken: string | null = null;

  setToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Resolve the bearer token for a request. The shared `useAuth` hook persists
   * the verified session token in localStorage under `quant_access_token`, so
   * the client mirrors it here — previously nothing ever called `setToken()`,
   * which meant EVERY request went out without an Authorization header and the
   * dashboard spun on skeletons before surfacing a raw 401 to the user.
   */
  private resolveToken(): string | null {
    if (this.accessToken) return this.accessToken;
    try {
      if (typeof window !== 'undefined') {
        return window.localStorage.getItem('quant_access_token');
      }
    } catch {
      // Sandboxed iframe / SSR — no storage available.
    }
    return null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.resolveToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json() as Promise<ApiResponse<T>>;
  }

  // Campaigns
  async createCampaign(data: any) {
    return this.request<Campaign>('POST', '/campaigns', data);
  }
  async getCampaign(id: string) {
    return this.request<Campaign>('GET', `/campaigns/${id}`);
  }
  async listCampaigns(status?: string) {
    return this.request<Campaign[]>('GET', `/campaigns${status ? `?status=${status}` : ''}`);
  }
  async updateCampaign(id: string, data: any) {
    return this.request<Campaign>('PUT', `/campaigns/${id}`, data);
  }
  async updateCampaignStatus(id: string, status: string) {
    return this.request<Campaign>('PUT', `/campaigns/${id}/status`, { status });
  }
  async deleteCampaign(id: string) {
    return this.request<void>('DELETE', `/campaigns/${id}`);
  }
  async getDashboard() {
    return this.request<any>('GET', '/campaigns/dashboard');
  }

  // Creatives
  async createCreative(data: any) {
    return this.request<Creative>('POST', '/creatives', data);
  }
  async listCreatives(campaignId?: string) {
    return this.request<Creative[]>(
      'GET',
      `/creatives${campaignId ? `?campaignId=${campaignId}` : ''}`,
    );
  }
  async getCreative(id: string) {
    return this.request<Creative>('GET', `/creatives/${id}`);
  }
  async updateCreative(id: string, data: any) {
    return this.request<Creative>('PUT', `/creatives/${id}`, data);
  }

  // Targeting
  async estimateAudience(targeting: any) {
    return this.request<any>('POST', '/targeting/estimate', targeting);
  }
  async createAudience(data: any) {
    return this.request<CustomAudience>('POST', '/audiences', data);
  }
  async listAudiences() {
    return this.request<CustomAudience[]>('GET', '/audiences');
  }
  async getInterests() {
    return this.request<any>('GET', '/targeting/interests');
  }
  async getBehaviors() {
    return this.request<any>('GET', '/targeting/behaviors');
  }

  // Bidding
  async requestAd(app: string, position: string, userId: string) {
    return this.request<any>('POST', '/bidding/ad-request', { app, position, userId });
  }
  async getAuctionStats() {
    return this.request<any>('GET', '/bidding/stats');
  }
  async getBidModels() {
    return this.request<any>('GET', '/bidding/models');
  }

  // Analytics
  async getCampaignAnalytics(id: string) {
    return this.request<CampaignMetrics>('GET', `/analytics/campaigns/${id}`);
  }
  async generateReport(data: any) {
    return this.request<AnalyticsReport>('POST', '/analytics/reports', data);
  }
  async getRealtimeStats(id: string) {
    return this.request<any>('GET', `/analytics/campaigns/${id}/realtime`);
  }

  // Billing
  async getBalance() {
    return this.request<any>('GET', '/billing/balance');
  }
  async listInvoices() {
    return this.request<Invoice[]>('GET', '/billing/invoices');
  }
  async listPaymentMethods() {
    return this.request<PaymentMethod[]>('GET', '/billing/payment-methods');
  }
  async addPaymentMethod(data: any) {
    return this.request<PaymentMethod>('POST', '/billing/payment-methods', data);
  }

  // AI
  async predictPerformance(campaign: any) {
    return this.request<any>('POST', '/ai/predict-performance', { campaign });
  }
  async recommendBudget(campaign: any) {
    return this.request<any>('POST', '/ai/recommend-budget', { campaign });
  }
  async getCreativeSuggestions(campaign: any) {
    return this.request<any>('POST', '/ai/creative-suggestions', { campaign });
  }

  // Placements
  async getPlacements() {
    return this.request<any>('GET', '/placements');
  }
  async getPlacementSpecs() {
    return this.request<any>('GET', '/placements/specs');
  }
}

export const quantAdsAPI = new QuantAdsAPI();
export default QuantAdsAPI;
