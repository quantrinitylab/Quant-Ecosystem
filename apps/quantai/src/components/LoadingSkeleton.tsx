'use client';

import { motion } from 'framer-motion';

type SkeletonVariant = 'chat-message' | 'sidebar-item' | 'model-card';

interface LoadingSkeletonProps {
  variant: SkeletonVariant;
  count?: number;
}

function SkeletonBlock({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      className={`rounded bg-[var(--quant-muted)] ${className ?? ''}`}
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay }}
    />
  );
}

function ChatMessageSkeleton({ index }: { index: number }) {
  const isUser = index % 2 === 0;
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <SkeletonBlock className="flex-shrink-0 w-8 h-8 rounded-full" delay={index * 0.1} />
      <div className={`space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <SkeletonBlock className="h-4 w-48" delay={index * 0.1 + 0.05} />
        <SkeletonBlock className="h-4 w-32" delay={index * 0.1 + 0.1} />
      </div>
    </div>
  );
}

function SidebarItemSkeleton({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <SkeletonBlock className="w-5 h-5 rounded" delay={index * 0.08} />
      <SkeletonBlock className="h-4 flex-1" delay={index * 0.08 + 0.04} />
    </div>
  );
}

function ModelCardSkeleton({ index }: { index: number }) {
  return (
    <div className="p-3 rounded-lg border border-[var(--quant-border)] space-y-2">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="w-8 h-8 rounded-lg" delay={index * 0.1} />
        <div className="space-y-1 flex-1">
          <SkeletonBlock className="h-4 w-24" delay={index * 0.1 + 0.05} />
          <SkeletonBlock className="h-3 w-16" delay={index * 0.1 + 0.1} />
        </div>
      </div>
      <SkeletonBlock className="h-3 w-full" delay={index * 0.1 + 0.15} />
    </div>
  );
}

export function LoadingSkeleton({ variant, count = 3 }: LoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="space-y-4 p-4" role="status" aria-label="Loading content">
      {items.map((index) => {
        switch (variant) {
          case 'chat-message':
            return <ChatMessageSkeleton key={index} index={index} />;
          case 'sidebar-item':
            return <SidebarItemSkeleton key={index} index={index} />;
          case 'model-card':
            return <ModelCardSkeleton key={index} index={index} />;
        }
      })}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export default LoadingSkeleton;
