// ============================================================================
// QuantTube - LoadingSkeleton Component
// Shimmer skeleton with brand motion tokens for loading states
// ============================================================================

type SkeletonVariant = 'video-card' | 'player' | 'sidebar' | 'music-track';

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
  count?: number;
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div className={`bg-[var(--surface-elevated)] animate-shimmer rounded ${className ?? ''}`} />
  );
}

function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <ShimmerBlock className="aspect-video w-full rounded-lg" />
      <div className="flex gap-3 px-1">
        <ShimmerBlock className="w-9 h-9 rounded-full flex-shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <ShimmerBlock className="h-4 w-full" />
          <ShimmerBlock className="h-3 w-3/4" />
          <ShimmerBlock className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <ShimmerBlock className="aspect-video w-full rounded-lg" />
      <ShimmerBlock className="h-1 w-full rounded-full" />
      <div className="flex items-center gap-3 px-2">
        <ShimmerBlock className="w-10 h-10 rounded" />
        <ShimmerBlock className="w-10 h-10 rounded" />
        <ShimmerBlock className="flex-1 h-4 rounded" />
        <ShimmerBlock className="w-10 h-10 rounded" />
        <ShimmerBlock className="w-10 h-10 rounded" />
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex gap-3 p-2">
      <ShimmerBlock className="w-40 h-24 rounded flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <ShimmerBlock className="h-4 w-full" />
        <ShimmerBlock className="h-3 w-2/3" />
        <ShimmerBlock className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function MusicTrackSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <ShimmerBlock className="w-12 h-12 rounded" />
      <div className="flex-1 flex flex-col gap-1.5">
        <ShimmerBlock className="h-4 w-3/4" />
        <ShimmerBlock className="h-3 w-1/2" />
      </div>
      <ShimmerBlock className="w-12 h-3 rounded" />
    </div>
  );
}

export function LoadingSkeleton({ variant, count = 1 }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  const renderVariant = () => {
    switch (variant) {
      case 'video-card':
        return items.map((i) => <VideoCardSkeleton key={i} />);
      case 'player':
        return items.map((i) => <PlayerSkeleton key={i} />);
      case 'sidebar':
        return items.map((i) => <SidebarSkeleton key={i} />);
      case 'music-track':
        return items.map((i) => <MusicTrackSkeleton key={i} />);
      default:
        return null;
    }
  };

  return <>{renderVariant()}</>;
}

export default LoadingSkeleton;
