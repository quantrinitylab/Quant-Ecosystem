'use client';

import React, { createContext, useContext } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface MotionConfigContextValue {
  shouldAnimate: boolean;
}

const MotionConfigContext = createContext<MotionConfigContextValue | null>(null);

export interface MotionProviderProps {
  children: React.ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  const prefersReducedMotion = useReducedMotion();
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
