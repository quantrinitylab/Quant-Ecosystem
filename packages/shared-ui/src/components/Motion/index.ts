// ============================================================================
// Shared UI - Motion Components Barrel (union of phase-67/68 motion systems)
// ============================================================================

// Motion config provider + animation primitives (from trunk / PRs #81/#82)
export { MotionProvider, useMotionConfig } from './MotionConfig';
export type { MotionProviderProps, MotionConfigContextValue } from './MotionConfig';

export { FadeIn } from './FadeIn';
export type { FadeInProps } from './FadeIn';

export { StaggerList } from './StaggerList';
export type { StaggerListProps } from './StaggerList';

export { PageTransition } from './PageTransition';
export type { PageTransitionProps } from './PageTransition';

export { AnimatedSkeleton } from './AnimatedSkeleton';
export type { AnimatedSkeletonProps } from './AnimatedSkeleton';

export { SlidePanel } from './SlidePanel';
export type { SlidePanelProps } from './SlidePanel';

export { ScaleOnHover } from './ScaleOnHover';
export type { ScaleOnHoverProps } from './ScaleOnHover';

// Shared springy button (single canonical implementation)
export { SpringButton } from './SpringButton';
export type { SpringButtonProps } from './SpringButton';

// Additional motion components (from phases 68-72 branch)
export { AnimatedPage } from './AnimatedPage';
export type { AnimatedPageProps, PageTransitionVariant } from './AnimatedPage';

export { AnimatedList } from './AnimatedList';
export type { AnimatedListProps } from './AnimatedList';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps, SnapPoint } from './BottomSheet';

export { SkeletonFade } from './SkeletonFade';
export type { SkeletonFadeProps } from './SkeletonFade';

export { PullToRefresh } from './PullToRefresh';
export type { PullToRefreshProps } from './PullToRefresh';
