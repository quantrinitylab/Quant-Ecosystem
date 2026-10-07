// ============================================================================
// QuantChat - Avatar shared types (client)
// Mirrors the public API surface of backend/lib/avatar-generator.ts
// ============================================================================

export type AlienStyle = 'crystalline' | 'bioluminescent' | 'cybernetic';

export type ReactionEmotion = 'happy' | 'sad' | 'surprised' | 'angry' | 'love';

/** Surfaces an alien avatar can be rendered on (Requirement 5.5, Task 5.6). */
export type AvatarSurface =
  | 'chat_bubble'
  | 'profile_header'
  | 'story_ring'
  | 'reaction_animation'
  | 'friend_list'
  | 'map_pin';

export const ALIEN_STYLES: readonly AlienStyle[] = [
  'crystalline',
  'bioluminescent',
  'cybernetic',
] as const;

export const REACTION_EMOTIONS: readonly ReactionEmotion[] = [
  'happy',
  'sad',
  'surprised',
  'angry',
  'love',
] as const;

export interface AvatarVariant {
  style: AlienStyle;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface AvatarGenerationResponse {
  variants: AvatarVariant[];
  faceDetectionConfidence: number;
  processingTimeMs?: number;
}

export interface UserAvatar {
  userId: string;
  style: AlienStyle;
  imageUrl: string;
  thumbnailUrl: string;
  reactions?: Record<ReactionEmotion, { animation: string; durationMs: number }>;
  updatedAt?: string;
}

/** Human-readable labels for the style picker UI. */
export const ALIEN_STYLE_LABELS: Record<AlienStyle, string> = {
  crystalline: 'Crystalline',
  bioluminescent: 'Bioluminescent',
  cybernetic: 'Cybernetic',
};
