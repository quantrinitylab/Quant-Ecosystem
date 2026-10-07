import * as crypto from 'crypto';

export interface ChatRoomConfig {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isPasswordProtected: boolean;
  passwordHash?: string;
  salt?: string;
  slowModeSeconds: number; // 0 = disabled, e.g. 5, 10, 30, 60
  isPrivate: boolean;
  creatorUserId: string;
  createdAt: string;
}

export interface SlowModeCheckResult {
  allowed: boolean;
  remainingSeconds: number;
  nextAllowedAt?: number; // timestamp ms
}

export interface FilteredContentResult {
  originalContent: string;
  cleanContent: string;
  hasProfanity: boolean;
  matchedWords: string[];
}

const DEFAULT_PROFANITY_WORDS = [
  'badword',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'pussy',
  'slut',
  'whore',
  'bastard',
];

let rooms = new Map<string, ChatRoomConfig>();
let userLastMessageTimes = new Map<string, Map<string, number>>(); // roomId -> userId -> timestamp

export function createRoom(
  data: {
    name: string;
    slug: string;
    description?: string;
    password?: string;
    slowModeSeconds?: number;
    isPrivate?: boolean;
    creatorUserId: string;
  },
  secretKey: string,
): ChatRoomConfig {
  const id = crypto.randomUUID();
  let isPasswordProtected = false;
  let passwordHash: string | undefined;
  let salt: string | undefined;

  if (data.password) {
    isPasswordProtected = true;
    salt = crypto.randomBytes(16).toString('hex');
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(data.password + salt);
    passwordHash = hmac.digest('hex');
  }

  const room: ChatRoomConfig = {
    id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    isPasswordProtected,
    passwordHash,
    salt,
    slowModeSeconds: Math.max(0, data.slowModeSeconds || 0),
    isPrivate: data.isPrivate || false,
    creatorUserId: data.creatorUserId,
    createdAt: new Date().toISOString(),
  };

  rooms.set(id, room);
  return room;
}

export function verifyRoomPassword(
  roomId: string,
  candidatePassword: string,
  secretKey: string,
): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.isPasswordProtected || !room.passwordHash || !room.salt) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(candidatePassword + room.salt);
  const candidateHash = hmac.digest('hex');

  if (candidateHash.length !== room.passwordHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(room.passwordHash));
}

export function checkSlowMode(
  roomId: string,
  userId: string,
  isUserAdmin?: boolean,
): SlowModeCheckResult {
  const room = rooms.get(roomId);
  if (!room) {
    return { allowed: false, remainingSeconds: 0 };
  }

  if (isUserAdmin || room.slowModeSeconds === 0) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const roomTimes = userLastMessageTimes.get(roomId);
  if (!roomTimes) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const lastMessageAt = roomTimes.get(userId);
  if (!lastMessageAt) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const now = Date.now();
  const elapsedSeconds = (now - lastMessageAt) / 1000;

  if (elapsedSeconds < room.slowModeSeconds) {
    const remainingSeconds = Math.ceil(room.slowModeSeconds - elapsedSeconds);
    const nextAllowedAt = lastMessageAt + room.slowModeSeconds * 1000;
    return { allowed: false, remainingSeconds, nextAllowedAt };
  }

  return { allowed: true, remainingSeconds: 0 };
}

export function recordUserMessageSent(roomId: string, userId: string): void {
  let roomTimes = userLastMessageTimes.get(roomId);
  if (!roomTimes) {
    roomTimes = new Map<string, number>();
    userLastMessageTimes.set(roomId, roomTimes);
  }
  roomTimes.set(userId, Date.now());
}

export function filterProfanity(
  content: string,
  customProhibitedWords?: string[],
): FilteredContentResult {
  const prohibitedWords = customProhibitedWords || DEFAULT_PROFANITY_WORDS;
  let cleanContent = content;
  let hasProfanity = false;
  const matchedWords: string[] = [];

  for (const word of prohibitedWords) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
      hasProfanity = true;
      if (!matchedWords.includes(match[1].toLowerCase())) {
        matchedWords.push(match[1].toLowerCase());
      }
    }
    cleanContent = cleanContent.replace(regex, (m) => '*'.repeat(m.length));
  }

  return {
    originalContent: content,
    cleanContent,
    hasProfanity,
    matchedWords,
  };
}

export function getRoom(roomId: string): ChatRoomConfig | null {
  return rooms.get(roomId) || null;
}

export function clearRoomsForTesting(): void {
  rooms.clear();
  userLastMessageTimes.clear();
}
