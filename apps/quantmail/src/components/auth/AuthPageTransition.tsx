// ============================================================================
// AuthPageTransition — zero-JS page-enter animation for the public auth pages
// (login, register, forgot-password, reset-password).
//
// Drop-in replacement for the framer-motion `PageTransition` from
// `@quant/shared-ui` on the auth shell. The animation is pure CSS
// (`@keyframes auth-page-enter` in apps/quantmail/src/app/globals.css):
// opacity 0→1 + translateY(20px→0) over 300ms with the exact same
// cubic-bezier(0.0, 0.0, 0.2, 1.0) ease as PageTransition — zero visual change,
// zero JS in the auth shell payload. Do NOT re-introduce framer-motion here.
//
// `animated={false}` mirrors PageTransition's `animated` flag: renders a plain
// div with no animation class (also what PageTransition does under
// prefers-reduced-motion, which the CSS handles via a media query).
// ============================================================================

import type { ReactNode } from 'react';

export interface AuthPageTransitionProps {
  className?: string;
  children: ReactNode;
  animated?: boolean;
}

export function AuthPageTransition({
  className,
  children,
  animated = true,
}: AuthPageTransitionProps) {
  const classes = [animated ? 'auth-page-transition' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <div className={classes || undefined}>{children}</div>;
}
