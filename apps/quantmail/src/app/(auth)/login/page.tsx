// ============================================================================
// QuantMail Executive Sovereign Sign-In — server-rendered auth shell
// (fix/qm-login-paint-vs-gmail).
//
// This page is intentionally a SERVER component (no 'use client'). The auth
// shell — AuthShell, AuthBrandPanel, AuthPageTransition — renders to static
// HTML on the server with zero client JS: the usable sign-in form paints
// with the first document bytes, Gmail-style, instead of waiting on a
// client-booted SPA shell. Only the interactive form island
// (./login-form.tsx, 'use client') ships JS and hydrates.
//
// Search-param notices (?success=, ?switch_to=, ?add_account=) are read by
// the island via useSearchParams, so the server HTML stays identical for a
// given URL — which is what lets the edge cache the shell (see
// src/middleware.ts AUTH_SHELL_CACHE_CONTROL).
// ============================================================================

import { Suspense } from 'react';
import { AuthPageTransition } from '../../../components/auth/AuthPageTransition';
import { AuthShell } from '../../../components/auth/AuthShell';
import { LoginForm } from './login-form';
import { LoginBrand, LoginSkeletonBody } from './login-skeleton';

export default function LoginPage() {
  return (
    <AuthPageTransition>
      <AuthShell brand={<LoginBrand />}>
        {/* The island suspends only during static prerender; the root layout
            already opts every route into dynamic rendering via headers(), so
            at runtime this streams the real form immediately. The skeleton
            is the instant paint for the brief moment before it arrives. */}
        <Suspense fallback={<LoginSkeletonBody />}>
          <LoginForm />
        </Suspense>
      </AuthShell>
    </AuthPageTransition>
  );
}
