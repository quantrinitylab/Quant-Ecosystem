// ============================================================================
// QuantTube API - Monetization Service
// Revenue calculation, membership tiers, super chats, merch integration
// ============================================================================

interface RevenueBreakdown {
  ads: number;
  memberships: number;
  superChats: number;
  merchShelf: number;
  premium: number;
  total: number;
}

interface MembershipTier {
  id: string;
  channelId: string;
  name: string;
  price: number;
  perks: string[];
  memberCount: number;
  isActive: boolean;
  createdAt: string;
}

interface SuperChat {
  id: string;
  channelId: string;
  videoId: string;
  userId: string;
  username: string;
  amount: number;
  currency: string;
  message: string;
  color: string;
  pinDuration: number;
  createdAt: string;
}

interface MerchItem {
  id: string;
  channelId: string;
  title: string;
  price: number;
  imageUrl: string;
  externalUrl: string;
  isActive: boolean;
  salesCount: number;
}

interface PayoutRecord {
  id: string;
  channelId: string;
  amount: number;
  method: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledDate: string;
  processedDate: string | null;
}

interface PayoutSettings {
  channelId: string;
  method: 'bank_transfer' | 'paypal' | 'wire';
  threshold: number;
  schedule: 'weekly' | 'biweekly' | 'monthly';
  accountDetails: Record<string, string>;
}

type TimeRange = 'day' | 'week' | 'month' | 'year' | 'all';

class MonetizationService {
  private tiers: Map<string, MembershipTier> = new Map();
  private superChats: Map<string, SuperChat> = new Map();
  private merchItems: Map<string, MerchItem> = new Map();
  private payouts: Map<string, PayoutRecord[]> = new Map();
  private settings: Map<string, PayoutSettings> = new Map();

  async getRevenue(channelId: string, timeRange: TimeRange): Promise<RevenueBreakdown> {
    const multiplier = timeRange === 'day' ? 1 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365;
    const baseDaily = 150 + Math.random() * 100;
    return {
      ads: parseFloat((baseDaily * multiplier * 0.45).toFixed(2)),
      memberships: parseFloat((baseDaily * multiplier * 0.20).toFixed(2)),
      superChats: parseFloat((baseDaily * multiplier * 0.08).toFixed(2)),
      merchShelf: parseFloat((baseDaily * multiplier * 0.22).toFixed(2)),
      premium: parseFloat((baseDaily * multiplier * 0.05).toFixed(2)),
      total: parseFloat((baseDaily * multiplier).toFixed(2)),
    };
  }

  async getMembershipTiers(channelId: string): Promise<MembershipTier[]> {
    return Array.from(this.tiers.values()).filter(t => t.channelId === channelId);
  }

  async createTier(channelId: string, data: { name: string; price: number; perks: string[] }): Promise<MembershipTier> {
    const tier: MembershipTier = {
      id: `tier_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      channelId,
      name: data.name,
      price: data.price,
      perks: data.perks,
      memberCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.tiers.set(tier.id, tier);
    return tier;
  }

  async updateTier(tierId: string, updates: Partial<MembershipTier>): Promise<MembershipTier | null> {
    const tier = this.tiers.get(tierId);
    if (!tier) return null;
    Object.assign(tier, updates);
    return tier;
  }

  async deleteTier(tierId: string): Promise<void> {
    this.tiers.delete(tierId);
  }

  async processSuperChat(data: { channelId: string; videoId: string; userId: string; username: string; amount: number; message: string }): Promise<SuperChat> {
    const color = data.amount >= 100 ? '#FF0000' : data.amount >= 50 ? '#FF6600' : data.amount >= 20 ? '#FFFF00' : '#00FFFF';
    const pinDuration = data.amount >= 100 ? 300 : data.amount >= 50 ? 120 : data.amount >= 20 ? 60 : 30;
    const superChat: SuperChat = {
      id: `sc_${Date.now()}`,
      channelId: data.channelId,
      videoId: data.videoId,
      userId: data.userId,
      username: data.username,
      amount: data.amount,
      currency: 'USD',
      message: data.message,
      color,
      pinDuration,
      createdAt: new Date().toISOString(),
    };
    this.superChats.set(superChat.id, superChat);
    return superChat;
  }

  async getSuperChats(channelId: string, videoId?: string): Promise<SuperChat[]> {
    let chats = Array.from(this.superChats.values()).filter(sc => sc.channelId === channelId);
    if (videoId) chats = chats.filter(sc => sc.videoId === videoId);
    return chats.sort((a, b) => b.amount - a.amount);
  }

  async getMerchItems(channelId: string): Promise<MerchItem[]> {
    return Array.from(this.merchItems.values()).filter(m => m.channelId === channelId);
  }

  async addMerchItem(channelId: string, data: { title: string; price: number; imageUrl: string; externalUrl: string }): Promise<MerchItem> {
    const item: MerchItem = {
      id: `merch_${Date.now()}`,
      channelId,
      title: data.title,
      price: data.price,
      imageUrl: data.imageUrl,
      externalUrl: data.externalUrl,
      isActive: true,
      salesCount: 0,
    };
    this.merchItems.set(item.id, item);
    return item;
  }

  async getPayoutHistory(channelId: string): Promise<PayoutRecord[]> {
    return this.payouts.get(channelId) || [];
  }

  async requestPayout(channelId: string, amount: number): Promise<PayoutRecord> {
    const settings = this.settings.get(channelId);
    const record: PayoutRecord = {
      id: `payout_${Date.now()}`,
      channelId,
      amount,
      method: settings?.method || 'bank_transfer',
      status: 'pending',
      scheduledDate: new Date().toISOString(),
      processedDate: null,
    };
    const history = this.payouts.get(channelId) || [];
    history.push(record);
    this.payouts.set(channelId, history);
    return record;
  }

  async getPayoutSettings(channelId: string): Promise<PayoutSettings | null> {
    return this.settings.get(channelId) || null;
  }

  async updatePayoutSettings(channelId: string, updates: Partial<PayoutSettings>): Promise<PayoutSettings> {
    const current = this.settings.get(channelId) || {
      channelId, method: 'bank_transfer' as const, threshold: 100, schedule: 'monthly' as const, accountDetails: {},
    };
    const updated = { ...current, ...updates };
    this.settings.set(channelId, updated);
    return updated;
  }
}

export const monetizationService = new MonetizationService();
export default MonetizationService;
