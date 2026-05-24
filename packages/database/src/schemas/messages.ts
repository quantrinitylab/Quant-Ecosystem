// ============================================================================
// Database Schema - Messages (QuantChat)
// ============================================================================

/** Conversation/group chat schema */
export interface ConversationSchema {
  id: string;
  type: 'direct' | 'group' | 'channel';
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  isArchived: boolean;
  isPinned: boolean;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Conversation members */
export interface ConversationMemberSchema {
  id: string;
  conversationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  nickname: string | null;
  isMuted: boolean;
  muteUntil: string | null;
  joinedAt: string;
  leftAt: string | null;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}

/** Message schema */
export interface MessageSchema {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  mediaType: string | null;
  mediaDuration: number | null;
  replyToId: string | null;
  forwardedFromId: string | null;
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  expiresAt: string | null;
  reactions: MessageReaction[];
  mentions: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Message types */
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice_note'
  | 'file'
  | 'sticker'
  | 'gif'
  | 'location'
  | 'contact'
  | 'poll'
  | 'system';

/** Message reaction */
export interface MessageReaction {
  emoji: string;
  userId: string;
  createdAt: string;
}

/** Message delivery status */
export interface MessageStatusSchema {
  id: string;
  messageId: string;
  userId: string;
  status: 'sent' | 'delivered' | 'read';
  deliveredAt: string | null;
  readAt: string | null;
}

/** Story/Status schema (disappearing content) */
export interface StorySchema {
  id: string;
  userId: string;
  type: 'image' | 'video' | 'text';
  mediaUrl: string | null;
  textContent: string | null;
  backgroundColor: string | null;
  fontStyle: string | null;
  duration: number;
  viewCount: number;
  expiresAt: string;
  createdAt: string;
}

/** Story views tracking */
export interface StoryViewSchema {
  id: string;
  storyId: string;
  viewerId: string;
  viewedAt: string;
  reaction: string | null;
}

/** Call history */
export interface CallSchema {
  id: string;
  conversationId: string | null;
  callerId: string;
  type: 'voice' | 'video' | 'group_voice' | 'group_video';
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'failed';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  duration: number | null;
  participants: CallParticipant[];
  metadata: Record<string, unknown>;
}

/** Call participant */
export interface CallParticipant {
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

export const MESSAGES_TABLE = {
  tableName: 'messages',
  columns: [
    { name: 'id', type: 'UUID', primaryKey: true },
    { name: 'conversation_id', type: 'UUID', nullable: false, references: 'conversations(id)' },
    { name: 'sender_id', type: 'UUID', nullable: false, references: 'users(id)' },
    { name: 'type', type: 'VARCHAR(20)', nullable: false },
    { name: 'content', type: 'TEXT', nullable: true },
    { name: 'media_url', type: 'TEXT', nullable: true },
    { name: 'media_thumbnail_url', type: 'TEXT', nullable: true },
    { name: 'media_type', type: 'VARCHAR(50)', nullable: true },
    { name: 'media_duration', type: 'INTEGER', nullable: true },
    { name: 'reply_to_id', type: 'UUID', nullable: true, references: 'messages(id)' },
    { name: 'forwarded_from_id', type: 'UUID', nullable: true },
    { name: 'is_edited', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'edited_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'is_deleted', type: 'BOOLEAN DEFAULT FALSE', nullable: false },
    { name: 'expires_at', type: 'TIMESTAMPTZ', nullable: true },
    { name: 'reactions', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'mentions', type: "JSONB DEFAULT '[]'", nullable: false },
    { name: 'metadata', type: "JSONB DEFAULT '{}'", nullable: false },
    { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()', nullable: false },
  ],
  indexes: [
    { name: 'idx_messages_conversation', columns: ['conversation_id', 'created_at'] },
    { name: 'idx_messages_sender', columns: ['sender_id'] },
    { name: 'idx_messages_expires', columns: ['expires_at'] },
  ],
} as const;
