// ============================================================================
// @quant/shared-ui - Reusable React UI Components
// ============================================================================

// Base components
export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

export { Input } from './components/Input';
export type { InputProps } from './components/Input';

export { Modal } from './components/Modal';
export type { ModalProps } from './components/Modal';

export { Avatar } from './components/Avatar';
export type { AvatarProps } from './components/Avatar';

export { Card } from './components/Card';
export type { CardProps } from './components/Card';

export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';

export { Toast } from './components/Toast';
export type { ToastProps } from './components/Toast';

export { Loader } from './components/Loader';
export type { LoaderProps } from './components/Loader';

// Media components
export { VideoPlayer, AudioPlayer, ImageViewer } from './components/MediaPlayer';
export type { VideoPlayerProps, AudioPlayerProps, ImageViewerProps } from './components/MediaPlayer';

// Chat components
export { ChatBubble } from './components/Chat/ChatBubble';
export type { ChatBubbleProps } from './components/Chat/ChatBubble';

export { ChatInput } from './components/Chat/ChatInput';
export type { ChatInputProps } from './components/Chat/ChatInput';

export { ChatList } from './components/Chat/ChatList';
export type { ChatListProps, ChatListItem } from './components/Chat/ChatList';

export { TypingIndicator } from './components/Chat/TypingIndicator';
export type { TypingIndicatorProps } from './components/Chat/TypingIndicator';

// Feed components
export { FeedCard } from './components/Feed/FeedCard';
export type { FeedCardProps } from './components/Feed/FeedCard';

export { StoryRing } from './components/Feed/StoryRing';
export type { StoryRingProps, StoryItem } from './components/Feed/StoryRing';

// Navigation components
export { BottomNav } from './components/Navigation/BottomNav';
export type { BottomNavProps, NavItem } from './components/Navigation/BottomNav';

export { TopBar } from './components/Navigation/TopBar';
export type { TopBarProps } from './components/Navigation/TopBar';

export { SearchBar } from './components/Navigation/SearchBar';
export type { SearchBarProps } from './components/Navigation/SearchBar';

// AI components
export { AISuggestion } from './components/AI/AISuggestion';
export type { AISuggestionProps } from './components/AI/AISuggestion';

export { AIChat } from './components/AI/AIChat';
export type { AIChatProps, AIChatMessage } from './components/AI/AIChat';

// Hooks
export { useAuth } from './hooks/useAuth';
export type { UseAuthReturn, AuthUser } from './hooks/useAuth';

export { useRealtime } from './hooks/useRealtime';
export type { UseRealtimeReturn, UseRealtimeOptions } from './hooks/useRealtime';

export { useTheme } from './hooks/useTheme';
export type { UseThemeReturn, ThemeMode } from './hooks/useTheme';

// Themes
export { lightTheme } from './themes/light';
export { darkTheme } from './themes/dark';
export { neonTheme } from './themes/neon';
