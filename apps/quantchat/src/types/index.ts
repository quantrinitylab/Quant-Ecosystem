// ============================================================================
// QuantChat - Type Definitions
// Complete type system for Snapchat-like messaging application
// ============================================================================

import type { BaseEntity, MediaAttachment } from '@quant/common';

// ============================================================================
// User & Auth Types
// ============================================================================

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';
export type VerificationStatus = 'pending' | 'verified' | 'expired';

export interface ChatUser extends BaseEntity {
  phoneNumber: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bitmojiId?: string;
  status: UserStatus;
  lastSeen: Date;
  quantMailId?: string;
  bio?: string;
  birthday?: Date;
  friendCount: number;
  snapScore: number;
  isVerified: boolean;
  settings: UserSettings;
}

export interface UserSettings {
  ghostMode: boolean;
  notificationsEnabled: boolean;
  storyPrivacy: 'everyone' | 'friends' | 'custom';
  locationSharing: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  twoFactorEnabled: boolean;
  theme: 'light' | 'dark' | 'auto';
}

export interface PhoneAuthRequest {
  phoneNumber: string;
  countryCode: string;
}

export interface OTPVerifyRequest {
  phoneNumber: string;
  otp: string;
  deviceId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

// ---- Broadcast channels (Telegram-style one-to-many) ----------------------

/** A channel's public shape. */
export interface ChannelView {
  id: string;
  name: string | null;
  description: string | null;
  ownerId: string;
  subscriberCount: number;
}

/** A channel plus the caller's membership role and posting capability. */
export interface SubscribedChannelView extends ChannelView {
  role: string;
  canPost: boolean;
}

/** A single broadcast message in a channel feed. */
export interface ChannelMessageView {
  id: string;
  channelId: string;
  senderId: string;
  content: string | null;
  createdAt: string;
}

export interface QuantMailLinkRequest {
  quantMailEmail: string;
  quantMailToken: string;
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'voice'
  | 'sticker'
  | 'gif'
  | 'location'
  | 'contact'
  | 'file';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type DisappearMode = 'off' | 'after_view' | '24h' | '7d' | '30d';

export interface Message extends BaseEntity {
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  mediaThumbnail?: string;
  mediaMetadata?: MediaMetadata;
  status: MessageStatus;
  disappearMode: DisappearMode;
  disappearAt?: Date;
  expiresAt?: Date;
  replyTo?: string;
  reactions: MessageReaction[];
  isPinned: boolean;
  isEdited: boolean;
  editedAt?: Date;
  mentions: string[];
  encryptionKey?: string;
  readBy: ReadReceipt[];
  deliveredTo: string[];
}

export interface MediaMetadata {
  width?: number;
  height?: number;
  duration?: number;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
  timestamp: Date;
}

export interface ReadReceipt {
  userId: string;
  readAt: Date;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  timestamp: Date;
}

export interface MessageEdit {
  messageId: string;
  newContent: string;
}

export interface MessagePin {
  messageId: string;
  conversationId: string;
  pinnedBy: string;
}

// ============================================================================
// Conversation Types
// ============================================================================

export type ConversationType = 'direct' | 'group';

export interface Conversation extends BaseEntity {
  type: ConversationType;
  participants: ConversationParticipant[];
  name?: string;
  avatarUrl?: string;
  lastMessage?: Message;
  lastActivityAt: Date;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  muteUntil?: Date;
  disappearMode: DisappearMode;
  encryptionEnabled: boolean;
}

export interface ConversationParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Date;
  lastReadAt?: Date;
  nickname?: string;
}

// ============================================================================
// Story Types
// ============================================================================

export type StoryType = 'photo' | 'video' | 'text';
export type StoryPrivacy = 'everyone' | 'friends' | 'close_friends' | 'custom';

export interface Story extends BaseEntity {
  userId: string;
  type: StoryType;
  mediaUrl: string;
  thumbnailUrl?: string;
  text?: string;
  textStyle?: TextStyle;
  filters: string[];
  stickers: StorySticker[];
  duration: number;
  privacy: StoryPrivacy;
  allowedViewers?: string[];
  blockedViewers?: string[];
  expiresAt: Date;
  viewCount: number;
  viewers: StoryViewer[];
  replies: StoryReply[];
  isHighlight: boolean;
  highlightId?: string;
  location?: GeoLocation;
  music?: MusicTrack;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  alignment: 'left' | 'center' | 'right';
  position: { x: number; y: number };
}

export interface StorySticker {
  id: string;
  type:
    | 'emoji'
    | 'gif'
    | 'poll'
    | 'question'
    | 'countdown'
    | 'mention'
    | 'location'
    | 'music'
    | 'custom';
  content: string;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
}

export interface StoryViewer {
  userId: string;
  viewedAt: Date;
  screenshotted: boolean;
}

export interface StoryReply {
  id: string;
  userId: string;
  content: string;
  type: 'text' | 'emoji' | 'snap';
  timestamp: Date;
}

export interface StoryHighlight extends BaseEntity {
  userId: string;
  title: string;
  coverUrl: string;
  storyIds: string[];
  orderIndex: number;
}

export interface CloseFriendsList {
  userId: string;
  friendIds: string[];
  updatedAt: Date;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  previewUrl: string;
  startTime: number;
  duration: number;
}

// ============================================================================
// Snap Types
// ============================================================================

export type SnapType = 'photo' | 'video';
export type SnapStatus =
  | 'pending'
  | 'delivered'
  | 'opened'
  | 'replayed'
  | 'expired'
  | 'screenshotted';

export interface Snap extends BaseEntity {
  senderId: string;
  recipientIds: string[];
  type: SnapType;
  mediaUrl: string;
  thumbnailUrl?: string;
  duration: number;
  filters: string[];
  caption?: string;
  captionPosition?: { x: number; y: number };
  stickers: StorySticker[];
  isReplayable: boolean;
  maxReplays: number;
  replaysUsed: number;
  expiresAfterView: number;
  statuses: SnapRecipientStatus[];
  location?: GeoLocation;
  savedToMemories: boolean;
}

export interface SnapRecipientStatus {
  userId: string;
  status: SnapStatus;
  deliveredAt?: Date;
  openedAt?: Date;
  replayedAt?: Date;
  screenshottedAt?: Date;
}

export interface SnapStreak {
  id: string;
  userIds: [string, string];
  count: number;
  startedAt: Date;
  lastSnapAt: Date;
  expiresAt: Date;
  isAboutToExpire: boolean;
  longestStreak: number;
  emoji?: string;
}

export interface SnapMemory extends BaseEntity {
  userId: string;
  snapId: string;
  mediaUrl: string;
  thumbnailUrl: string;
  type: SnapType;
  tags: string[];
  location?: GeoLocation;
  isFavorite: boolean;
}

// ============================================================================
// Call Types
// ============================================================================

export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'busy';

export interface Call extends BaseEntity {
  callId: string;
  type: CallType;
  initiatorId: string;
  participants: CallParticipant[];
  status: CallStatus;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
  isGroupCall: boolean;
  groupId?: string;
  isScreenSharing: boolean;
  isRecording: boolean;
  recordingUrl?: string;
  quality: CallQuality;
}

export interface CallParticipant {
  userId: string;
  joinedAt: Date;
  leftAt?: Date;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

export interface CallQuality {
  bitrate: number;
  frameRate: number;
  resolution: string;
  packetLoss: number;
  latency: number;
}

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup';
  from: string;
  to: string;
  callId: string;
  payload: unknown;
}

export interface CallRecording {
  callId: string;
  url: string;
  duration: number;
  size: number;
  createdAt: Date;
}

// ============================================================================
// Group Types
// ============================================================================

export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface Group extends BaseEntity {
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorId: string;
  members: GroupMember[];
  memberCount: number;
  maxMembers: number;
  settings: GroupSettings;
  inviteLink?: string;
  inviteCode?: string;
  isPublic: boolean;
  tags: string[];
}

export interface GroupMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: GroupRole;
  joinedAt: Date;
  addedBy?: string;
  nickname?: string;
  isMuted: boolean;
}

export interface GroupSettings {
  allowMemberInvites: boolean;
  allowMemberEdit: boolean;
  disappearMode: DisappearMode;
  slowMode: number;
  mediaOnly: boolean;
  adminOnlyPost: boolean;
  joinApproval: boolean;
  maxFileSize: number;
  allowedMediaTypes: MessageType[];
}

export interface GroupInvite {
  id: string;
  groupId: string;
  inviterId: string;
  inviteeId?: string;
  code: string;
  expiresAt: Date;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
}

// ============================================================================
// Discover Types
// ============================================================================

export type DiscoverContentType = 'story' | 'show' | 'article' | 'game' | 'lens';
export type DiscoverCategory =
  | 'news'
  | 'entertainment'
  | 'sports'
  | 'fashion'
  | 'food'
  | 'gaming'
  | 'science'
  | 'technology'
  | 'music'
  | 'comedy';

export interface DiscoverItem extends BaseEntity {
  publisherId: string;
  publisherName: string;
  publisherAvatarUrl: string;
  type: DiscoverContentType;
  title: string;
  description?: string;
  thumbnailUrl: string;
  mediaUrl: string;
  category: DiscoverCategory;
  tags: string[];
  viewCount: number;
  shareCount: number;
  isFeatured: boolean;
  isTrending: boolean;
  duration?: number;
  expiresAt?: Date;
  isSubscribed: boolean;
}

export interface Publisher extends BaseEntity {
  name: string;
  description: string;
  avatarUrl: string;
  coverUrl: string;
  category: DiscoverCategory;
  subscriberCount: number;
  contentCount: number;
  isVerified: boolean;
  website?: string;
}

export interface Subscription {
  userId: string;
  publisherId: string;
  subscribedAt: Date;
  notificationsEnabled: boolean;
}

// ============================================================================
// AR Filter Types
// ============================================================================

export type FilterType = 'face' | 'world' | 'geo' | 'color' | 'beauty' | '3d_object';
export type FilterCategory = 'funny' | 'beauty' | 'artistic' | 'seasonal' | 'branded' | 'community';

export interface ARFilter extends BaseEntity {
  name: string;
  description?: string;
  thumbnailUrl: string;
  previewUrl: string;
  type: FilterType;
  category: FilterCategory;
  creatorId: string;
  creatorName: string;
  downloadCount: number;
  usageCount: number;
  rating: number;
  isOfficial: boolean;
  isTrending: boolean;
  faceTrackingData: FaceTrackingConfig;
  assets: FilterAsset[];
  tags: string[];
}

export interface FaceTrackingConfig {
  trackingPoints: number;
  meshEnabled: boolean;
  expressionDetection: boolean;
  multiface: boolean;
  depthSensing: boolean;
  landmarks: FaceLandmark[];
}

export interface FaceLandmark {
  name: string;
  position: { x: number; y: number; z: number };
  type: 'eye' | 'nose' | 'mouth' | 'chin' | 'forehead' | 'cheek' | 'ear';
}

export interface FilterAsset {
  id: string;
  type: 'texture' | 'mesh' | 'animation' | 'shader' | 'audio';
  url: string;
  size: number;
}

export interface CustomFilterRequest {
  name: string;
  type: FilterType;
  assets: FilterAsset[];
  faceTrackingConfig: FaceTrackingConfig;
  category: FilterCategory;
  tags: string[];
}

// ============================================================================
// AI Types
// ============================================================================

export type AIFeature =
  | 'smart_reply'
  | 'translation'
  | 'moderation'
  | 'chatbot'
  | 'sticker_gen'
  | 'caption';

export interface SmartReply {
  id: string;
  text: string;
  confidence: number;
  tone: 'casual' | 'friendly' | 'professional' | 'funny';
}

export interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface ModerationResult {
  isApproved: boolean;
  score: number;
  categories: ModerationCategory[];
  action: 'allow' | 'warn' | 'block' | 'review';
  reason?: string;
}

export interface ModerationCategory {
  name: string;
  score: number;
  flagged: boolean;
}

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface StickerGenerationRequest {
  prompt: string;
  style: 'cartoon' | 'realistic' | 'pixel' | 'watercolor' | 'minimal';
  count: number;
}

// ============================================================================
// Bitmoji Types
// ============================================================================

export type BitmojiExpression =
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'angry'
  | 'cool'
  | 'love'
  | 'thinking'
  | 'wink'
  | 'laugh'
  | 'neutral';
export type BitmojiOutfitCategory =
  | 'casual'
  | 'formal'
  | 'sporty'
  | 'seasonal'
  | 'costume'
  | 'accessory';

export interface Bitmoji extends BaseEntity {
  userId: string;
  avatarId: string;
  style: 'classic' | 'deluxe' | '3d';
  gender: 'male' | 'female' | 'non_binary';
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyeShape: string;
  eyeColor: string;
  noseShape: string;
  mouthShape: string;
  facialHair?: string;
  accessories: string[];
  outfit: BitmojiOutfit;
  expressions: BitmojiExpressionAsset[];
  previewUrl: string;
}

export interface BitmojiOutfit {
  id: string;
  name: string;
  category: BitmojiOutfitCategory;
  topUrl: string;
  bottomUrl: string;
  shoesUrl: string;
  accessoryUrls: string[];
}

export interface BitmojiExpressionAsset {
  expression: BitmojiExpression;
  url: string;
  animatedUrl?: string;
}

export interface BitmojiCustomization {
  feature: string;
  value: string;
  options: string[];
}

// ============================================================================
// Map Types
// ============================================================================

export interface GeoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  address?: string;
  city?: string;
  country?: string;
}

export interface FriendLocation {
  userId: string;
  username: string;
  avatarUrl?: string;
  bitmojiUrl?: string;
  location: GeoLocation;
  lastUpdated: Date;
  isGhostMode: boolean;
  actionText?: string;
  battery?: number;
  speed?: number;
}

export interface HeatMapData {
  location: GeoLocation;
  intensity: number;
  eventType: 'snap' | 'story' | 'checkin' | 'event';
  count: number;
}

export interface Place extends BaseEntity {
  name: string;
  description?: string;
  location: GeoLocation;
  category: string;
  rating: number;
  reviewCount: number;
  photoUrl: string;
  isOpen: boolean;
  openHours?: string;
  priceLevel: number;
  geofilter?: GeoFilter;
}

export interface GeoFilter extends BaseEntity {
  name: string;
  location: GeoLocation;
  radius: number;
  overlayUrl: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  usageCount: number;
  creatorId: string;
}

export interface MapEvent {
  id: string;
  title: string;
  location: GeoLocation;
  startTime: Date;
  endTime: Date;
  attendeeCount: number;
  category: string;
  thumbnailUrl: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType =
  | 'message'
  | 'snap'
  | 'story_reply'
  | 'call'
  | 'group_invite'
  | 'friend_request'
  | 'streak_warning'
  | 'mention'
  | 'reaction';

export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  actionUrl?: string;
  imageUrl?: string;
  senderId?: string;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

export type WSEventType =
  | 'message:new'
  | 'message:update'
  | 'message:delete'
  | 'message:reaction'
  | 'message:read'
  | 'typing:start'
  | 'typing:stop'
  | 'presence:update'
  | 'call:incoming'
  | 'call:signal'
  | 'call:ended'
  | 'snap:received'
  | 'snap:opened'
  | 'snap:screenshot'
  | 'story:new'
  | 'story:viewed'
  | 'streak:warning'
  | 'notification:new';

export interface WSEvent {
  type: WSEventType;
  payload: unknown;
  timestamp: number;
  senderId?: string;
}

export interface WSAuthPayload {
  token: string;
  deviceId: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface SendMessageRequest {
  conversationId: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  replyTo?: string;
  disappearMode?: DisappearMode;
  mentions?: string[];
}

export interface CreateStoryRequest {
  type: StoryType;
  mediaUrl: string;
  text?: string;
  textStyle?: TextStyle;
  filters?: string[];
  stickers?: StorySticker[];
  privacy: StoryPrivacy;
  allowedViewers?: string[];
  duration?: number;
  location?: GeoLocation;
  music?: MusicTrack;
}

export interface SendSnapRequest {
  recipientIds: string[];
  type: SnapType;
  mediaUrl: string;
  duration: number;
  filters?: string[];
  caption?: string;
  stickers?: StorySticker[];
  isReplayable?: boolean;
}

export interface InitiateCallRequest {
  participantIds: string[];
  type: CallType;
  isGroupCall?: boolean;
  groupId?: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  memberIds: string[];
  isPublic?: boolean;
  settings?: Partial<GroupSettings>;
}

export interface LocationUpdateRequest {
  location: GeoLocation;
  battery?: number;
  speed?: number;
}
