/**
 * Chatzy v1.0.14-Grade Message Pinning, Starred Messages, and Categorized Media Gallery Engine
 *
 * Implements:
 * - Pinned Messages with admin cap (FIFO purge of oldest when limit exceeded) and quick-jump order
 * - Starred / Bookmarked Messages per user with search and channel filter support
 * - Categorized Media Gallery aggregating conversation media across photos, videos, audio, documents, and links
 */

export type MediaCategory = 'photos' | 'videos' | 'audio' | 'documents' | 'links';

export interface ChatMessageMediaItem {
  id: string;
  channelId: string;
  messageId: string;
  senderUserId: string;
  category: MediaCategory;
  url: string;
  fileName?: string;
  fileSizeBytes?: number;
  thumbnailUrl?: string;
  mimeType?: string;
  sentAt: string;
}

export interface PinnedMessageItem {
  channelId: string;
  messageId: string;
  pinnedByUserId: string;
  pinnedAt: string;
  order: number;
}

export interface StarredMessageItem {
  userId: string;
  channelId: string;
  messageId: string;
  contentSnippet: string;
  starredAt: string;
}

// In-memory data structures
const pinnedMessagesMap = new Map<string, PinnedMessageItem[]>();
const starredMessagesMap = new Map<string, Map<string, StarredMessageItem>>();
const mediaItemsMap = new Map<string, ChatMessageMediaItem[]>();

/**
 * Pins a message in a channel/conversation.
 * Enforces maximum pinned messages cap (default 5).
 * If exceeded, removes oldest pinned message (FIFO purge).
 * Returns the current list of pinned messages in order.
 */
export function pinMessage(
  channelId: string,
  messageId: string,
  userId: string,
  maxPinned: number = 5,
): PinnedMessageItem[] {
  let pins = pinnedMessagesMap.get(channelId);
  if (!pins) {
    pins = [];
    pinnedMessagesMap.set(channelId, pins);
  }

  const existingIndex = pins.findIndex((p) => p.messageId === messageId);
  if (existingIndex !== -1) {
    // If already pinned, update pinnedByUserId and pinned timestamp
    pins[existingIndex].pinnedByUserId = userId;
    pins[existingIndex].pinnedAt = new Date().toISOString();
    return getPinnedMessages(channelId);
  }

  // FIFO purge if capacity reached
  while (pins.length >= maxPinned && pins.length > 0) {
    pins.shift();
  }

  const newPin: PinnedMessageItem = {
    channelId,
    messageId,
    pinnedByUserId: userId,
    pinnedAt: new Date().toISOString(),
    order: pins.length + 1,
  };

  pins.push(newPin);

  // Normalize order values (1..N)
  pins.forEach((p, idx) => {
    p.order = idx + 1;
  });

  return getPinnedMessages(channelId);
}

/**
 * Unpins a message from a channel.
 * Returns true if message was found and removed, false otherwise.
 */
export function unpinMessage(channelId: string, messageId: string): boolean {
  const pins = pinnedMessagesMap.get(channelId);
  if (!pins) {
    return false;
  }

  const index = pins.findIndex((p) => p.messageId === messageId);
  if (index === -1) {
    return false;
  }

  pins.splice(index, 1);

  // Re-normalize order
  pins.forEach((p, idx) => {
    p.order = idx + 1;
  });

  return true;
}

/**
 * Returns the list of pinned messages for a channel, sorted by order ascending.
 */
export function getPinnedMessages(channelId: string): PinnedMessageItem[] {
  const pins = pinnedMessagesMap.get(channelId);
  if (!pins) {
    return [];
  }
  return [...pins].sort((a, b) => a.order - b.order);
}

/**
 * Stars or bookmarks a message for a specific user.
 * Returns the StarredMessageItem.
 */
export function starMessage(
  userId: string,
  channelId: string,
  messageId: string,
  contentSnippet: string,
): StarredMessageItem {
  let userStars = starredMessagesMap.get(userId);
  if (!userStars) {
    userStars = new Map<string, StarredMessageItem>();
    starredMessagesMap.set(userId, userStars);
  }

  const starredItem: StarredMessageItem = {
    userId,
    channelId,
    messageId,
    contentSnippet,
    starredAt: new Date().toISOString(),
  };

  userStars.set(messageId, starredItem);
  return starredItem;
}

/**
 * Unstars a message for a specific user.
 * Returns true if the message was starred and successfully removed, false otherwise.
 */
export function unstarMessage(userId: string, messageId: string): boolean {
  const userStars = starredMessagesMap.get(userId);
  if (!userStars || !userStars.has(messageId)) {
    return false;
  }
  return userStars.delete(messageId);
}

/**
 * Lists starred messages for a specific user, optionally filtered by channelId.
 * Sorted by starredAt descending (most recently starred first).
 */
export function listStarredMessages(userId: string, channelId?: string): StarredMessageItem[] {
  const userStars = starredMessagesMap.get(userId);
  if (!userStars) {
    return [];
  }

  let items = Array.from(userStars.values());
  if (channelId) {
    items = items.filter((item) => item.channelId === channelId);
  }

  return items.sort((a, b) => new Date(b.starredAt).getTime() - new Date(a.starredAt).getTime());
}

/**
 * Indexes a media item shared in a conversation into the gallery.
 */
export function indexMediaItem(item: Omit<ChatMessageMediaItem, 'id'>): ChatMessageMediaItem {
  const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const mediaItem: ChatMessageMediaItem = {
    ...item,
    id,
  };

  let channelMedia = mediaItemsMap.get(item.channelId);
  if (!channelMedia) {
    channelMedia = [];
    mediaItemsMap.set(item.channelId, channelMedia);
  }

  channelMedia.push(mediaItem);
  return mediaItem;
}

/**
 * Retrieves all media items for a channel, optionally filtered by category.
 * Sorted by sentAt descending (newest first).
 */
export function getChannelMedia(
  channelId: string,
  category?: MediaCategory,
): ChatMessageMediaItem[] {
  const items = mediaItemsMap.get(channelId);
  if (!items) {
    return [];
  }

  let filtered = [...items];
  if (category) {
    filtered = filtered.filter((m) => m.category === category);
  }

  return filtered.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
}

/**
 * Clears all gallery data structures for test isolation.
 */
export function clearGalleryForTesting(): void {
  pinnedMessagesMap.clear();
  starredMessagesMap.clear();
  mediaItemsMap.clear();
}

/**
 * Service object export for modular or OOP consumption.
 */
export const ChatMediaGalleryService = {
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  starMessage,
  unstarMessage,
  listStarredMessages,
  indexMediaItem,
  getChannelMedia,
  clearGalleryForTesting,
};
