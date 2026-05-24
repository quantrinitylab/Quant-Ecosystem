// ============================================================================
// QuantMax - Video Chat Service
// Random pairing, WebRTC signaling, interest matching, moderation
// ============================================================================

import type { VideoChat, VideoChatPreferences, VideoChatStatus } from '../../src/types';

interface WaitingUser {
  userId: string;
  preferences: VideoChatPreferences;
  joinedAt: number;
  skipCount: number;
}

interface ChatSession {
  chat: VideoChat;
  textMessages: { userId: string; content: string; timestamp: string }[];
  gameState?: { game: string; state: Record<string, unknown> };
}

export class VideoChatService {
  private waitingQueue: WaitingUser[] = [];
  private activeSessions: Map<string, ChatSession> = new Map();
  private userSessions: Map<string, string> = new Map(); // userId -> chatId
  private blockedPairs: Set<string> = new Set();
  private maxSkipsPerHour = 20;
  private skipCounts: Map<string, { count: number; resetAt: number }> = new Map();

  joinQueue(userId: string, preferences: VideoChatPreferences): { chatId: string | null; status: VideoChatStatus } {
    // Check skip limit
    const skipRecord = this.skipCounts.get(userId);
    if (skipRecord && skipRecord.count >= this.maxSkipsPerHour && skipRecord.resetAt > Date.now()) {
      return { chatId: null, status: 'ended' };
    }

    // Remove from existing session
    this.leaveCurrentSession(userId);

    // Try to find a match
    const matchedUser = this.findMatch(userId, preferences);
    if (matchedUser) {
      const chat = this.createSession(userId, matchedUser.userId, preferences, matchedUser.preferences);
      this.waitingQueue = this.waitingQueue.filter(w => w.userId !== matchedUser.userId);
      return { chatId: chat.id, status: 'connected' };
    }

    // Add to waiting queue
    this.waitingQueue.push({ userId, preferences, joinedAt: Date.now(), skipCount: 0 });
    return { chatId: null, status: 'searching' };
  }

  private findMatch(userId: string, preferences: VideoChatPreferences): WaitingUser | null {
    const candidates = this.waitingQueue.filter(w => {
      if (w.userId === userId) return false;
      if (this.isBlocked(userId, w.userId)) return false;
      return this.preferencesMatch(preferences, w.preferences);
    });

    if (candidates.length === 0) return null;

    // Sort by shared interests
    candidates.sort((a, b) => {
      const sharedA = a.preferences.interests.filter(i => preferences.interests.includes(i)).length;
      const sharedB = b.preferences.interests.filter(i => preferences.interests.includes(i)).length;
      return sharedB - sharedA;
    });

    return candidates[0];
  }

  private preferencesMatch(pref1: VideoChatPreferences, pref2: VideoChatPreferences): boolean {
    // Language match
    if (pref1.language !== pref2.language && pref1.language !== 'any' && pref2.language !== 'any') return false;
    return true;
  }

  private createSession(userId1: string, userId2: string, prefs1: VideoChatPreferences, prefs2: VideoChatPreferences): VideoChat {
    const matchedInterests = prefs1.interests.filter(i => prefs2.interests.includes(i));
    const chat: VideoChat = {
      id: `vc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      participants: [userId1, userId2],
      status: 'connected',
      matchedInterests,
      startedAt: new Date().toISOString(),
      duration: 0,
      hasTextFallback: prefs1.enableTextFallback && prefs2.enableTextFallback,
    };

    const session: ChatSession = { chat, textMessages: [] };
    this.activeSessions.set(chat.id, session);
    this.userSessions.set(userId1, chat.id);
    this.userSessions.set(userId2, chat.id);
    return chat;
  }

  skip(userId: string): { nextChatId: string | null; status: VideoChatStatus } {
    // Track skips
    const now = Date.now();
    const skipRecord = this.skipCounts.get(userId) || { count: 0, resetAt: now + 3600000 };
    if (skipRecord.resetAt <= now) { skipRecord.count = 0; skipRecord.resetAt = now + 3600000; }
    skipRecord.count++;
    this.skipCounts.set(userId, skipRecord);

    // End current session
    const chatId = this.userSessions.get(userId);
    if (chatId) {
      const session = this.activeSessions.get(chatId);
      if (session) {
        session.chat.status = 'skipped';
        session.chat.endedAt = new Date().toISOString();
        session.chat.duration = (Date.now() - new Date(session.chat.startedAt).getTime()) / 1000;
      }
    }

    this.leaveCurrentSession(userId);
    return { nextChatId: null, status: 'searching' };
  }

  sendTextMessage(userId: string, content: string): boolean {
    const chatId = this.userSessions.get(userId);
    if (!chatId) return false;
    const session = this.activeSessions.get(chatId);
    if (!session || !session.chat.hasTextFallback) return false;
    session.textMessages.push({ userId, content, timestamp: new Date().toISOString() });
    return true;
  }

  getSession(chatId: string): ChatSession | null {
    return this.activeSessions.get(chatId) || null;
  }

  getUserSession(userId: string): ChatSession | null {
    const chatId = this.userSessions.get(userId);
    if (!chatId) return null;
    return this.activeSessions.get(chatId) || null;
  }

  endSession(userId: string): boolean {
    const chatId = this.userSessions.get(userId);
    if (!chatId) return false;
    const session = this.activeSessions.get(chatId);
    if (session) {
      session.chat.status = 'ended';
      session.chat.endedAt = new Date().toISOString();
      session.chat.duration = (Date.now() - new Date(session.chat.startedAt).getTime()) / 1000;
    }
    this.leaveCurrentSession(userId);
    return true;
  }

  reportUser(reporterId: string, reason: string): boolean {
    const chatId = this.userSessions.get(reporterId);
    if (!chatId) return false;
    const session = this.activeSessions.get(chatId);
    if (!session) return false;
    session.chat.reportedBy = reporterId;
    const otherUser = session.chat.participants.find(p => p !== reporterId);
    if (otherUser) this.blockPair(reporterId, otherUser);
    this.endSession(reporterId);
    return true;
  }

  private leaveCurrentSession(userId: string): void {
    const chatId = this.userSessions.get(userId);
    if (chatId) {
      this.userSessions.delete(userId);
      const session = this.activeSessions.get(chatId);
      if (session) {
        const otherUser = session.chat.participants.find(p => p !== userId);
        if (otherUser) this.userSessions.delete(otherUser);
      }
    }
    this.waitingQueue = this.waitingQueue.filter(w => w.userId !== userId);
  }

  private blockPair(userId1: string, userId2: string): void {
    this.blockedPairs.add(`${userId1}:${userId2}`);
    this.blockedPairs.add(`${userId2}:${userId1}`);
  }

  private isBlocked(userId1: string, userId2: string): boolean {
    return this.blockedPairs.has(`${userId1}:${userId2}`);
  }

  getQueueLength(): number {
    return this.waitingQueue.length;
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

export const videoChatService = new VideoChatService();
