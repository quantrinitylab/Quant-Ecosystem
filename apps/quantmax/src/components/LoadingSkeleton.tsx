// ============================================================================
// QuantMax - Loading Skeleton Component
// Shimmer skeleton with brand motion. Variants: video-feed, swipe-card, match-list
// ============================================================================

import { motion } from 'framer-motion';

type SkeletonVariant = 'video-feed' | 'swipe-card' | 'match-list';

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <motion.div
      className={`rounded-lg bg-[var(--quant-muted)] ${className ?? ''}`}
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function VideoFeedSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--quant-background)]">
      <div className="relative h-full w-full max-w-md">
        <ShimmerBlock className="absolute inset-0" />
        {/* Action buttons placeholder */}
        <div className="absolute bottom-32 right-3 flex flex-col gap-5">
          <ShimmerBlock className="h-11 w-11 !rounded-full" />
          <ShimmerBlock className="h-11 w-11 !rounded-full" />
          <ShimmerBlock className="h-11 w-11 !rounded-full" />
        </div>
        {/* Bottom info placeholder */}
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 pb-20">
          <ShimmerBlock className="h-4 w-24" />
          <ShimmerBlock className="h-3 w-48" />
          <ShimmerBlock className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}

function SwipeCardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-4">
      <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)]">
        <ShimmerBlock className="h-[420px] w-full !rounded-none" />
        <div className="space-y-2 p-5">
          <ShimmerBlock className="h-6 w-40" />
          <ShimmerBlock className="h-4 w-24" />
          <div className="flex gap-2 pt-2">
            <ShimmerBlock className="h-6 w-16 !rounded-full" />
            <ShimmerBlock className="h-6 w-20 !rounded-full" />
            <ShimmerBlock className="h-6 w-14 !rounded-full" />
          </div>
        </div>
      </div>
      {/* Action buttons skeleton */}
      <div className="flex items-center justify-center gap-5 py-4">
        <ShimmerBlock className="h-14 w-14 !rounded-full" />
        <ShimmerBlock className="h-12 w-12 !rounded-full" />
        <ShimmerBlock className="h-14 w-14 !rounded-full" />
      </div>
    </div>
  );
}

function MatchListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <ShimmerBlock className="h-14 w-14 shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2">
            <ShimmerBlock className="h-4 w-32" />
            <ShimmerBlock className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ variant }: LoadingSkeletonProps) {
  switch (variant) {
    case 'video-feed':
      return <VideoFeedSkeleton />;
    case 'swipe-card':
      return <SwipeCardSkeleton />;
    case 'match-list':
      return <MatchListSkeleton />;
  }
}

export default LoadingSkeleton;
