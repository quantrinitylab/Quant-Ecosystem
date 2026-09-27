/**
 * Grupo Chat v3.15-Grade Custom Sticker Pack Engine & Live Voice Broadcast Channel Manager
 *
 * Features:
 * - Community & official sticker packs with shortcode tags (e.g. :rocket:, :sticker:quant_rocket:)
 * - Animated and static SVG/WebP/PNG sticker item registry
 * - In-chat message parsing with shortcode detection and rich tag replacement
 * - Live voice broadcast channel state machine: host priority, speaker list, audience listener count,
 *   ambient background audio track URL support, and test fixtures.
 */

export interface StickerItem {
  id: string;
  packId: string;
  code: string; // e.g. ":rocket:" or ":thumbs_up:"
  imageUrl: string;
  isAnimated: boolean;
  tags: string[];
}

export interface StickerPack {
  id: string;
  name: string;
  author: string;
  thumbnailUrl: string;
  stickers: StickerItem[];
  isOfficial: boolean;
  downloadCount: number;
  createdAt: string;
}

export interface VoiceBroadcastChannel {
  channelId: string;
  title: string;
  hostUserId: string;
  isLive: boolean;
  speakers: string[]; // userIds
  listenersCount: number;
  ambientTrackUrl?: string;
  startedAt: string;
}

interface BroadcastInternalSession {
  channel: VoiceBroadcastChannel;
  speakerSet: Set<string>;
  listenerSet: Set<string>;
}

// In-memory persistent registries
const stickerPacks = new Map<string, StickerPack>();
const broadcastSessions = new Map<string, BroadcastInternalSession>();

/**
 * Normalizes shortcode to ensure leading and trailing colons.
 */
function normalizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed.startsWith(':') && !trimmed.endsWith(':')) {
    return `:${trimmed}:`;
  }
  return trimmed;
}

/**
 * Creates a new sticker pack.
 */
export function createStickerPack(data: {
  name: string;
  author: string;
  thumbnailUrl: string;
  isOfficial?: boolean;
}): StickerPack {
  const id = `pack_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const pack: StickerPack = {
    id,
    name: data.name,
    author: data.author,
    thumbnailUrl: data.thumbnailUrl,
    stickers: [],
    isOfficial: data.isOfficial ?? false,
    downloadCount: 0,
    createdAt: new Date().toISOString(),
  };

  stickerPacks.set(id, pack);
  return { ...pack, stickers: [...pack.stickers] };
}

/**
 * Adds a new sticker item to an existing sticker pack.
 */
export function addStickerToPack(
  packId: string,
  sticker: {
    code: string;
    imageUrl: string;
    isAnimated?: boolean;
    tags?: string[];
  },
): StickerItem {
  const pack = stickerPacks.get(packId);
  if (!pack) {
    throw new Error(`Sticker pack not found: ${packId}`);
  }

  const id = `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const item: StickerItem = {
    id,
    packId,
    code: normalizeCode(sticker.code),
    imageUrl: sticker.imageUrl,
    isAnimated: sticker.isAnimated ?? false,
    tags: sticker.tags ?? [],
  };

  pack.stickers.push(item);
  return { ...item };
}

/**
 * Retrieves a sticker pack by its ID.
 */
export function getStickerPack(packId: string): StickerPack | null {
  const pack = stickerPacks.get(packId);
  if (!pack) return null;
  return { ...pack, stickers: [...pack.stickers] };
}

/**
 * Lists all registered sticker packs.
 */
export function listStickerPacks(): StickerPack[] {
  return Array.from(stickerPacks.values()).map((p) => ({
    ...p,
    stickers: [...p.stickers],
  }));
}

/**
 * Parses message content to identify embedded sticker shortcodes and replace them with rich image representations.
 */
export function parseMessageStickers(content: string): {
  parsedContent: string;
  stickersFound: StickerItem[];
} {
  if (!content) {
    return { parsedContent: content ?? '', stickersFound: [] };
  }

  // Build map of registered sticker codes (both lowercase and exact)
  const codeToSticker = new Map<string, StickerItem>();
  for (const pack of stickerPacks.values()) {
    for (const sticker of pack.stickers) {
      codeToSticker.set(sticker.code.toLowerCase(), sticker);
      const rawCode = sticker.code.replace(/^:+|:+$/g, '').toLowerCase();
      if (rawCode) {
        codeToSticker.set(`:${rawCode}:`, sticker);
      }
    }
  }

  const stickersFound: StickerItem[] = [];
  const foundStickerIds = new Set<string>();

  // Match shortcodes like :rocket:, :thumbs_up:, :sticker:quant_rocket:
  const shortcodeRegex = /:[a-zA-Z0-9_:-]+:/g;

  const parsedContent = content.replace(shortcodeRegex, (match) => {
    const sticker = codeToSticker.get(match.toLowerCase());
    if (sticker) {
      if (!foundStickerIds.has(sticker.id)) {
        stickersFound.push(sticker);
        foundStickerIds.add(sticker.id);
      }
      return `<img class="chat-sticker" src="${sticker.imageUrl}" alt="${sticker.code}" data-sticker-id="${sticker.id}" data-animated="${sticker.isAnimated}" />`;
    }
    return match;
  });

  return {
    parsedContent,
    stickersFound,
  };
}

/**
 * Starts a live voice broadcast channel with the host as the initial speaker.
 */
export function startVoiceBroadcast(
  channelId: string,
  hostUserId: string,
  title: string,
  ambientTrackUrl?: string,
): VoiceBroadcastChannel {
  const speakerSet = new Set<string>([hostUserId]);
  const listenerSet = new Set<string>();

  const channel: VoiceBroadcastChannel = {
    channelId,
    title,
    hostUserId,
    isLive: true,
    speakers: [hostUserId],
    listenersCount: 0,
    ambientTrackUrl,
    startedAt: new Date().toISOString(),
  };

  broadcastSessions.set(channelId, {
    channel,
    speakerSet,
    listenerSet,
  });

  return { ...channel, speakers: [...channel.speakers] };
}

/**
 * Adds a user to the voice broadcast either as a speaker or an audience listener.
 */
export function joinBroadcast(
  channelId: string,
  userId: string,
  asSpeaker: boolean = false,
): VoiceBroadcastChannel {
  const session = broadcastSessions.get(channelId);
  if (!session || !session.channel.isLive) {
    throw new Error(`Active voice broadcast not found for channel: ${channelId}`);
  }

  if (asSpeaker) {
    session.speakerSet.add(userId);
    session.listenerSet.delete(userId);
  } else {
    // If not host, user joins audience
    if (userId !== session.channel.hostUserId) {
      session.speakerSet.delete(userId);
    }
    session.listenerSet.add(userId);
  }

  session.channel.speakers = Array.from(session.speakerSet);
  session.channel.listenersCount = session.listenerSet.size;

  return { ...session.channel, speakers: [...session.channel.speakers] };
}

/**
 * Removes a user from the broadcast (either from speaker stage or audience listeners).
 */
export function leaveBroadcast(channelId: string, userId: string): VoiceBroadcastChannel {
  const session = broadcastSessions.get(channelId);
  if (!session || !session.channel.isLive) {
    throw new Error(`Active voice broadcast not found for channel: ${channelId}`);
  }

  session.listenerSet.delete(userId);
  if (userId !== session.channel.hostUserId) {
    session.speakerSet.delete(userId);
  }

  session.channel.speakers = Array.from(session.speakerSet);
  session.channel.listenersCount = session.listenerSet.size;

  return { ...session.channel, speakers: [...session.channel.speakers] };
}

/**
 * Stops a live voice broadcast channel. Only the host can stop it.
 */
export function stopVoiceBroadcast(channelId: string, hostUserId: string): boolean {
  const session = broadcastSessions.get(channelId);
  if (!session || !session.channel.isLive) {
    return false;
  }

  if (session.channel.hostUserId !== hostUserId) {
    return false;
  }

  session.channel.isLive = false;
  return true;
}

/**
 * Retrieves the broadcast status for a channel.
 */
export function getVoiceBroadcast(channelId: string): VoiceBroadcastChannel | null {
  const session = broadcastSessions.get(channelId);
  if (!session) return null;
  return { ...session.channel, speakers: [...session.channel.speakers] };
}

/**
 * Clears all sticker packs and voice broadcasts for testing isolation.
 */
export function clearStickersAndBroadcastsForTesting(): void {
  stickerPacks.clear();
  broadcastSessions.clear();
}

export const StickerBroadcastService = {
  createStickerPack,
  addStickerToPack,
  getStickerPack,
  listStickerPacks,
  parseMessageStickers,
  startVoiceBroadcast,
  joinBroadcast,
  leaveBroadcast,
  stopVoiceBroadcast,
  getVoiceBroadcast,
  clearStickersAndBroadcastsForTesting,
};
