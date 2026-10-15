// ============================================================================
// Set a new password — server-rendered auth shell (fix/qm-auth-pages-paint).
//
// This page is intentionally a SERVER component (no 'use client'). The auth
// shell — AuthShell, AuthBrandPanel, AuthPageTransition — renders to static
// HTML on the server with zero client JS: the usable new-password form
// paints with the first document bytes, Gmail-style, instead of waiting on
// a client-booted SPA shell. Only the interactive form island
// (./reset-password-form.tsx, 'use client') ships JS and hydrates.
//
// The island reads the reset ?token= via useSearchParams inside the Suspense
// boundary below, so the server HTML stays identical for a given URL — which
// is what lets the edge cache the shell (see src/middleware.ts
// AUTH_SHELL_CACHE_CONTROL).
// ============================================================================

import { Suspense } from 'react';
import { AuthPageTransition } from '../../components/auth/AuthPageTransition';
import { AuthShell } from '../../components/auth/AuthShell';
import { ResetPasswordForm } from './reset-password-form';
import { ResetPasswordBrand, ResetPasswordSkeletonBody } from './reset-password-skeleton';

export default function ResetPasswordPage() {
  return (
    <AuthPageTransition>
      <AuthShell brand={<ResetPasswordBrand />}>
        {/* The island suspends only during static prerender; the root layout
            already opts every route into dynamic rendering via headers(), so
            at runtime this streams the real form immediately. The skeleton
            is the instant paint for the brief moment before it arrives. */}
        <Suspense fallback={<ResetPasswordSkeletonBody />}>
          <ResetPasswordForm />
        </Suspense>
      </AuthShell>
    </AuthPageTransition>
  );
}
