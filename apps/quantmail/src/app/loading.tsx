'use client';

import { Skeleton } from '@quant/shared-ui';

export default function Loading() {
  return (
    <div className="flex h-screen animate-fade-in">
      <div className="w-64 border-r border-[var(--quant-border)] bg-[var(--quant-surface)] p-4 space-y-3 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-[var(--brand-app-color)] animate-pulse-brand" />
          <Skeleton variant="text" width="120px" height="24px" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="text" width="100%" height="44px" />
        ))}
      </div>
      <div className="flex-1 p-4 space-y-4">
        <Skeleton variant="rect" width="100%" height="40px" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" width="80px" height="32px" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rect" width="100%" height="72px" />
        ))}
      </div>
    </div>
  );
}
