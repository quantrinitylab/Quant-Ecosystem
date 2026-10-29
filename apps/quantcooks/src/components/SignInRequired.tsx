// ============================================================================
// QuantCooks — friendly "please sign in" state.
// Rendered instead of a raw API 401 ("Missing or invalid authorization header")
// whenever a page query fails unauthenticated — e.g. an expired token
// mid-session, or a stale deploy without the AuthGuard. Shows honest copy, a
// real link to /login (preserving the current path as returnTo), and gently
// navigates there after a beat so the visitor is never stranded on an infinite
// skeleton or a dead end.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { BrandMark } from './BrandMark';

export function SignInRequired({ appName = 'QuantCooks' }: { appName?: string }) {
  const router = useRouter();
  const href = `/login?returnTo=${encodeURIComponent(router.asPath || '/')}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void router.replace(href);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router, href]);

  // Design upgrade Phase A (D-2): same dark auth treatment as the
  // login page, so the gate never flashes the old light brand. Class
  // swaps + the brand lockup only — copy, href, role and the redirect
  // timer above are untouched.
  return (
    <div className="auth-canvas" role="status" aria-live="polite">
      <div className="auth-panel auth-panel-center">
        <div className="auth-lockup">
          <BrandMark size={36} variant="accent" />
          <span className="auth-wordmark">{appName}</span>
        </div>
        <h1 className="auth-title">Sign in to {appName}</h1>
        <p className="auth-sub">
          Your session has expired or you are signed out. Please sign in with your Quant account to
          continue — taking you there now.
        </p>
        <a className="auth-sso" href={href}>
          Go to sign in
        </a>
      </div>
    </div>
  );
}
