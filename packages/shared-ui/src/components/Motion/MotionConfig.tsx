'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface MotionConfigContextValue {
  shouldAnimate: boolean;
}

const MotionConfigContext = createContext<MotionConfigContextValue | null>(null);

export interface MotionProviderProps {
  children: React.ReactNode;
}

/**
 * fix/qm-auth-no-framer: local matchMedia implementation of
 * framer-motion's useReducedMotion (which is exactly this: a
 * prefers-reduced-motion media query listener). Drops the framer-motion
 * import from this module so lightweight consumers (e.g. LoadingState,
 * rendered by AuthGuard on every page incl. /login) don't pull the 114KB
 * library into their chunk.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function MotionProvider({ children }: MotionProviderProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = !prefersReducedMotion;

  return (
    <MotionConfigContext.Provider value={{ shouldAnimate }}>
      {children}
    </MotionConfigContext.Provider>
  );
}

export function useMotionConfig(): MotionConfigContextValue {
  const context = useContext(MotionConfigContext);
  if (context !== null) {
    return context;
  }
  // Fallback: no provider in tree, default to animating
  return { shouldAnimate: true };
}
