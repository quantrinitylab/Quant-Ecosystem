// ============================================================================
// QuantNeon API - Broadcast Service
// Broadcast channels, subscriber management, message delivery
// ============================================================================

interface BroadcastChannel {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  avatarUrl: string;
  subscriberCount: number;
  messageCount: number;
  isActive: boolean;
  createdAt: string;
}

interface BroadcastMessage {
  id: string;
  channelId: string;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'poll' | null;
  reactions: Map<string, number>;
  readCount: number;
  deliveredCount: number;
  createdAt: string;
}

interface ChannelSubscriber {
  userId: string;
  channelId: string;
  joinedAt: string;
  notificationsEnabled: boolean;
  isMuted: boolean;
}

class BroadcastService {
  private channels: Map<string, BroadcastChannel> = new Map();
  private messages: Map<string, BroadcastMessage[]> = new Map();
  private subscribers: Map<string, ChannelSubscriber[]> = new Map();

  async createChannel(ownerId: string, data: { name: string; description: string; avatarUrl?: string }): Promise<BroadcastChannel> {
    const channel: BroadcastChannel = {
      id: `bc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      ownerId,
      name: data.name,
      description: data.description,
      avatarUrl: data.avatarUrl || '/avatars/default-channel.jpg',
      subscriberCount: 0,
      messageCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.channels.set(channel.id, channel);
    this.messages.set(channel.id, []);
    this.subscribers.set(channel.id, []);
    return channel;
  }

  async getChannel(channelId: string): Promise<BroadcastChannel | null> {
    return this.channels.get(channelId) || null;
  }

  async getUserChannels(userId: string): Promise<BroadcastChannel[]> {
    return Array.from(this.channels.values()).filter(ch => ch.ownerId === userId);
  }

  async getSubscribedChannels(userId: string): Promise<BroadcastChannel[]> {
    const subscribedIds: string[] = [];
    this.subscribers.forEach((subs, channelId) => {
      if (subs.some(s => s.userId === userId)) subscribedIds.push(channelId);
    });
    return subscribedIds.map(id => this.channels.get(id)).filter((ch): ch is BroadcastChannel => ch !== undefined);
  }

  async subscribe(userId: string, channelId: string): Promise<ChannelSubscriber> {
    const sub: ChannelSubscriber = { userId, channelId, joinedAt: new Date().toISOString(), notificationsEnabled: true, isMuted: false };
    const subs = this.subscribers.get(channelId) || [];
    subs.push(sub);
    this.subscribers.set(channelId, subs);
    const channel = this.channels.get(channelId);
    if (channel) channel.subscriberCount++;
    return sub;
  }

  async unsubscribe(userId: string, channelId: string): Promise<void> {
    const subs = this.subscribers.get(channelId) || [];
    this.subscribers.set(channelId, subs.filter(s => s.userId !== userId));
    const channel = this.channels.get(channelId);
    if (channel) channel.subscriberCount = Math.max(0, channel.subscriberCount - 1);
  }

  async sendMessage(channelId: string, ownerId: string, data: { text: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'poll' }): Promise<BroadcastMessage> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.ownerId !== ownerId) throw new Error('Unauthorized');
    const message: BroadcastMessage = {
      id: `bm_${Date.now()}`,
      channelId,
      text: data.text,
      mediaUrl: data.mediaUrl || null,
      mediaType: data.mediaType || null,
      reactions: new Map(),
      readCount: 0,
      deliveredCount: channel.subscriberCount,
      createdAt: new Date().toISOString(),
    };
    const channelMessages = this.messages.get(channelId) || [];
    channelMessages.push(message);
    this.messages.set(channelId, channelMessages);
    channel.messageCount++;
    return message;
  }

  async getMessages(channelId: string, limit: number = 50, before?: string): Promise<BroadcastMessage[]> {
    const channelMessages = this.messages.get(channelId) || [];
    return channelMessages.slice(-limit).reverse();
  }

  async addReaction(messageId: string, channelId: string, emoji: string): Promise<void> {
    const channelMessages = this.messages.get(channelId) || [];
    const msg = channelMessages.find(m => m.id === messageId);
    if (msg) {
      const current = msg.reactions.get(emoji) || 0;
      msg.reactions.set(emoji, current + 1);
    }
  }

  async deleteChannel(channelId: string, ownerId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.ownerId !== ownerId) throw new Error('Unauthorized');
    this.channels.delete(channelId);
    this.messages.delete(channelId);
    this.subscribers.delete(channelId);
  }

  async getSubscribers(channelId: string): Promise<ChannelSubscriber[]> {
    return this.subscribers.get(channelId) || [];
  }
}

export const broadcastService = new BroadcastService();
export default BroadcastService;
