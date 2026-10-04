'use client';

// Brand context fed by the root layout (server), which resolves the brand
// from the request host. Client components consume it via useBrandName() so
// the server-rendered HTML and the hydrated client always agree — no
// hydration mismatch, correct brand on first paint.

import { createContext, useContext } from 'react';
import type { BrandName } from '../lib/branding';

const BrandContext = createContext<BrandName>('QuantAI');

export function BrandProvider({
  brand,
  children,
}: {
  brand: BrandName;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrandName(): BrandName {
  return useContext(BrandContext);
}
