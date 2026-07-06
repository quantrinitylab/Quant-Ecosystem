'use client';

import type { ReactNode } from 'react';

/**
 * Premium split-screen auth layout: an immersive brand panel on the left (only
 * on large screens) and the form on the right. On mobile the brand collapses to
 * a slim gradient header so the form stays front-and-center.
 */
export function AuthShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr] bg-[var(--quant-background)]">
      {/* Brand side */}
      <div className="hidden lg:block relative overflow-hidden">{brand}</div>

      {/* Form side */}
      <div className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        {children}
      </div>
    </div>
  );
}
