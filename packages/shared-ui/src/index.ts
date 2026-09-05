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

// Media (WebRTC/LiveKit) components
export {
  MeetingRoom,
  DevicePicker,
  ParticipantTile,
  LayoutManager,
  Controls,
  NetworkQuality,
  ChatSidecar,
  KnockFlow,
  Polls,
  BreakoutRoomPanel,
  BackgroundBlur,
  useBackgroundBlur,
} from './components/Media';
export type {
  MeetingRoomProps,
  ParticipantInfo,
  DevicePickerProps,
  DeviceInfo,
  ParticipantTileProps,
  LayoutManagerProps,
  LayoutMode,
  ControlsProps,
  NetworkQualityProps,
  ChatSidecarProps,
  ChatMessage,
  KnockFlowProps,
  KnockRequest,
  PollsProps,
  Poll,
  PollOption,
  BreakoutRoomPanelProps,
  BreakoutRoom,
  BackgroundBlurProps,
  BackgroundBlurOptions,
  UseBackgroundBlurReturn,
  BackgroundMode,
} from './components/Media';

// Media player components
export { VideoPlayer, AudioPlayer, ImageViewer } from './components/MediaPlayer';
export type {
  VideoPlayerProps,
  AudioPlayerProps,
  ImageViewerProps,
} from './components/MediaPlayer';

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

// QuantAI universal presence — the animated "alien" assistant rendered in every
// app via EcosystemShell, plus the provider/hook that lets any surface drive it.
export { AlienAvatar } from './components/QuantSidekick/AlienAvatar';
export type { AlienAvatarProps, QuantSidekickStatus } from './components/QuantSidekick/AlienAvatar';
export {
  QuantSidekick,
  QuantSidekickProvider,
  useQuantSidekick,
} from './components/QuantSidekick/QuantSidekick';
export type {
  QuantSidekickProps,
  QuantSidekickProviderProps,
  QuantSidekickContextValue,
  QuantSidekickSuggestion,
} from './components/QuantSidekick/QuantSidekick';

// Hooks
export { useAuth } from './hooks/useAuth';
export type { UseAuthReturn, AuthUser } from './hooks/useAuth';
export { configureQuantAuth } from './hooks/useAuth';
export type { QuantAuthEndpoints } from './hooks/useAuth';

export { useRealtime } from './hooks/useRealtime';
export type { UseRealtimeReturn, UseRealtimeOptions } from './hooks/useRealtime';

export { useTheme } from './hooks/useTheme';
export type { UseThemeReturn, ThemeMode } from './hooks/useTheme';

// Layout components
export { AppShell } from './components/Layout/AppShell';
export type { AppShellProps } from './components/Layout/AppShell';

export { Sidebar } from './components/Layout/Sidebar';
export type { SidebarProps, SidebarItem } from './components/Layout/Sidebar';

export { PageContainer } from './components/Layout/PageContainer';
export type { PageContainerProps, Breadcrumb } from './components/Layout/PageContainer';

// Form components
export { FormField } from './components/Form/FormField';
export type { FormFieldProps } from './components/Form/FormField';

export { TextArea } from './components/Form/TextArea';
export type { TextAreaProps } from './components/Form/TextArea';

export { Select } from './components/Form/Select';
export type { SelectProps, SelectOption } from './components/Form/Select';

export { SearchInput } from './components/Form/SearchInput';
export type { SearchInputProps } from './components/Form/SearchInput';

export { SearchClearButton } from './components/Form/SearchClearButton';

export { FileUpload } from './components/Form/FileUpload';
export type { FileUploadProps } from './components/Form/FileUpload';

// Dialog component
export { Dialog } from './components/Dialog';
export type { DialogProps } from './components/Dialog';

// Skeleton component
export { Skeleton } from './components/Skeleton';
export type { SkeletonProps } from './components/Skeleton';

// VoiceInput component
export { VoiceInput } from './components/VoiceInput';
export type { VoiceInputProps } from './components/VoiceInput';

// Themes
export { lightTheme } from './themes/light';
export { darkTheme } from './themes/dark';
export { neonTheme } from './themes/neon';

// Design tokens
export {
  lightTokens,
  darkTokens,
  neonTokens,
  tokensToCssVariables,
  density,
  elevation,
  breakpoints,
  accessibility,
  motion,
} from './themes/tokens';
export type {
  DesignTokens,
  DensityTokens,
  ElevationTokens,
  BreakpointTokens,
  AccessibilityTokens,
  MotionTokens,
} from './themes/tokens';

// Agent Dock components
export {
  AgentDock,
  AgentCard,
  ApprovalDialog,
  AgentTimeline,
  AgentCreator,
  AgentMiniWidget,
} from './agent';
export type {
  AgentDockProps,
  AgentCardProps,
  AgentStatus,
  ApprovalDialogProps,
  ApprovalRequest,
  AgentTimelineProps,
  TimelineEntry,
  AgentCreatorProps,
  AgentCreatorConfig,
  AgentMiniWidgetProps,
} from './agent';

// Advanced Frontend Systems
export * from './advanced';

// Shell components
export {
  GlobalNav,
  AppSwitcher,
  NotificationCenter,
  WorkspaceSwitcher,
  UserMenu,
  AIDock,
  CommandMenu,
  AppLauncher,
  RecentItems,
  StarredItems,
  SharingModal,
  ProfileCard,
  AISidePanel,
  UniversalSearch,
  NotificationPanel,
  QuickActions,
  UndoToast,
  OfflineIndicator,
  SettingsPanel,
  CrossAppRelations,
  ActivityFeed,
} from './components/Shell';
export type {
  GlobalNavProps,
  GlobalNavUser,
  AppSwitcherProps,
  AppSwitcherApp,
  NotificationCenterProps,
  Notification,
  WorkspaceSwitcherProps,
  Workspace,
  UserMenuProps,
  UserMenuUser,
  AIDockProps,
  CommandMenuProps,
  Command,
  AppLauncherProps,
  RecentItemsProps,
  RecentItem,
  StarredItemsProps,
  SharingModalProps,
  ProfileCardProps,
  ProfileCardUser,
  AISidePanelProps,
  AISidePanelMessage,
  UniversalSearchProps,
  SearchResult,
  SearchResultGroup,
  NotificationPanelProps,
  NotificationItem,
  NotificationAction,
  QuickActionsProps,
  QuickAction,
  UndoToastProps,
  OfflineIndicatorProps,
  ConnectionStatus,
  SettingsPanelProps,
  ThemeOption,
  NotificationPreference,
  ShortcutEntry,
  ShortcutGroup,
  CrossAppRelationsProps,
  RelatedItem,
  ActivityFeedProps,
  ActivityItem,
} from './components/Shell';

// State components
export {
  EmptyState,
  LoadingState,
  ErrorState,
  SuccessState,
  SkeletonCard,
  SkeletonGrid,
  OptimisticWrapper,
} from './components/States';
export type {
  EmptyStateProps,
  LoadingStateProps,
  ErrorStateProps,
  SuccessStateProps,
  SkeletonCardProps,
  SkeletonGridProps,
  OptimisticWrapperProps,
} from './components/States';

// Guards
export { AuthGuard, RouteGuard, OnboardingGuard } from './guards';
export type { AuthGuardProps, RouteGuardProps, OnboardingGuardProps } from './guards';

// Onboarding components
export {
  OnboardingFlow,
  OnboardingStep,
  WelcomeStep,
  WorkspaceSetupStep,
  ConnectAppsStep,
  AIPreferencesStep,
  FullOnboardingWizard,
  AppTourStep,
} from './components/Onboarding';
export type {
  OnboardingFlowProps,
  OnboardingStepProps,
  WelcomeStepProps,
  WorkspaceSetupStepProps,
  ConnectAppsStepProps,
  AppToggleItem,
  AIPreferencesStepProps,
  FullOnboardingWizardProps,
  OnboardingWizardData,
  AppTourStepProps,
  AppTourFeature,
} from './components/Onboarding';

// Auth components
export { LoginPage, ConsentScreen } from './components/Auth';
export type { LoginPageProps, ConsentScreenProps, Permission } from './components/Auth';

// Motion / Animation primitives (union of phase-67/68 motion systems)
export {
  MotionProvider,
  useMotionConfig,
  FadeIn,
  StaggerList,
  PageTransition,
  SpringButton,
  AnimatedSkeleton,
  SlidePanel,
  ScaleOnHover,
  AnimatedPage,
  AnimatedList,
  BottomSheet,
  SkeletonFade,
  PullToRefresh,
} from './components/Motion';
export type {
  MotionProviderProps,
  MotionConfigContextValue,
  FadeInProps,
  StaggerListProps,
  PageTransitionProps,
  SpringButtonProps,
  AnimatedSkeletonProps,
  SlidePanelProps,
  ScaleOnHoverProps,
  AnimatedPageProps,
  PageTransitionVariant,
  AnimatedListProps,
  BottomSheetProps,
  SnapPoint,
  SkeletonFadeProps,
  PullToRefreshProps,
} from './components/Motion';

// Responsive components
export { ResponsiveShell } from './components/Responsive';
export type { ResponsiveShellProps } from './components/Responsive';

// Motion/Responsive hooks
export { useReducedMotion } from './hooks/useReducedMotion';
export { useBreakpoint } from './hooks/useBreakpoint';
export type { BreakpointName } from './hooks/useBreakpoint';
export { useOrientation } from './hooks/useOrientation';
export type { Orientation } from './hooks/useOrientation';

// Focus trap for `aria-modal` surfaces
export { useFocusTrap } from './hooks/useFocusTrap';
export type { UseFocusTrapOptions } from './hooks/useFocusTrap';

// Keyboard Shortcuts hook
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export type {
  ShortcutDefinition,
  UseKeyboardShortcutsOptions,
  UseKeyboardShortcutsReturn,
} from './hooks/useKeyboardShortcuts';

// Drag and Drop hook
export { useDragDrop } from './hooks/useDragDrop';
export type { UseDragDropOptions, UseDragDropReturn } from './hooks/useDragDrop';

// Swipe actions hook — horizontal row actions that survive a vertical scroll
export { useSwipeActions } from './hooks/useSwipeActions';
export type {
  SwipeAction,
  UseSwipeActionsOptions,
  UseSwipeActionsReturn,
} from './hooks/useSwipeActions';

// CommandPaletteUI component
export { CommandPaletteUI } from './components/CommandPaletteUI';
export type { CommandPaletteUIProps, CommandPaletteItem } from './components/CommandPaletteUI';

// CommandPaletteProvider
export {
  CommandPaletteProvider,
  useCommandPalette,
} from './components/CommandPaletteUI/CommandPaletteProvider';

// useAskQuant hook
export { useAskQuant } from './hooks/useAskQuant';
export type { AskQuantMessage, UseAskQuantOptions, UseAskQuantReturn } from './hooks/useAskQuant';

// ThemeProvider component
export { ThemeProvider, useThemeMode } from './components/ThemeProvider';
export type {
  ThemeProviderProps,
  ThemeModeValue,
  ThemeContextValue,
} from './components/ThemeProvider';

// EmptyStateIllustration component
export { EmptyStateIllustration } from './components/EmptyStateIllustration';
export type {
  EmptyStateIllustrationProps,
  EmptyStateVariant,
} from './components/EmptyStateIllustration';

// useOptimisticAction hook
export { useOptimisticAction } from './hooks/useOptimisticAction';
export type { UseOptimisticActionReturn } from './hooks/useOptimisticAction';

// Sanitization utilities
export { sanitizeHtmlContent, sanitizeEmailHtml, sanitizeCodeHighlight } from './utils/sanitize';

// Roving-focus arithmetic for composite widgets (tablist, menu, radiogroup)
export { nextRovingIndex, rovingTabIndex } from './utils/roving-focus';
export type { RovingOrientation } from './utils/roving-focus';

// QuantLive components
export {
  QuantLive,
  QuantLiveOrb,
  QuantLiveCaptions,
  QuantLiveActionChip,
  QuantLivePrivacyIndicator,
  QuantLiveControls,
} from './components/quant-live';
export type {
  QuantLiveProps,
  QuantLiveState,
  OrbColorState,
  QuantLivePosition,
  CaptionEntry,
  ActionChipInfo,
  PrivacyState,
  QuantLiveOrbProps,
  QuantLiveCaptionsProps,
  QuantLiveActionChipProps,
  QuantLivePrivacyIndicatorProps,
  QuantLiveControlsProps,
} from './components/quant-live';

// VoiceCommandBar component
export { VoiceCommandBar } from './components/voice-command-bar';
export type { VoiceCommandBarProps } from './components/voice-command-bar';

// EcosystemShell — shared layout wrapper that mounts the six cross-cutting
// frontend surfaces (onboarding, command-palette, contextual-sidekick,
// universal-timeline, wellbeing, bharat-ai) once; apps inherit them by wrapping
// their root in <EcosystemShell> (design Open Question 1: shared layout wrapper).
export { EcosystemShell, EcosystemProvider, useEcosystem } from './components/EcosystemShell';
export type {
  EcosystemShellProps,
  EcosystemContextValue,
  EcosystemProviderProps,
} from './components/EcosystemShell';
// Backend-backed surface hooks (bharat-ai localization, wellbeing controls) —
// consumed via @quant/api-client against the Next /api/* proxy (no inline fetch).
export {
  useBharatLocale,
  useWellbeingSummary,
  useRecordWellbeingUsage,
} from './components/EcosystemShell';
export type {
  BharatLocaleBundle,
  WellbeingSummary,
  RecordUsageInput,
} from './components/EcosystemShell';
