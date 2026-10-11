'use client';

// ============================================================================
// QuantMail — OAuth authorization endpoint (browser flow).
//
// This is the page other Quant apps send the user to for "Continue with
// QuantMail": /oauth/authorize?response_type=code&client_id=…&redirect_uri=…
// &scope=…&state=…&code_challenge=…&code_challenge_method=S256
//
// Flow:
//   1. Validate the request (open-redirect safe: a bad redirect_uri shows an
//      honest error HERE and never bounces the user anywhere).
//   2. No QuantMail session → 302-style client redirect to /login?returnTo=<this URL>.
//   3. Session present → ask the backend (GET /api/oauth/authorize). When
//      consent already exists the backend answers 302 with ?code=… and we
//      forward the browser there (the only thing ever in the URL is the
//      one-time authorization code — never a token).
//   4. Otherwise render the NATIVE consent screen (honest copy: the app name
//      and the exact scopes, nothing invented) → POST /api/oauth/consent →
//      302 with ?code=… or ?error=access_denied.
//
// The backend's raw HTML consent screen still exists as a fallback but the
// browser flow never shows it; this page is the branded, honest surface.
// ============================================================================

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { browserAuthSession } from '../../../services/browser-auth-session';

const KNOWN_APPS: Record<string, string> = {
  quantai: 'QuantAI',
  quantchat: 'QuantChat',
  quantgram: 'QuantGram',
  quantube: 'QuanTube',
  quantwave: 'QuantWave',
  quantcooks: 'QuantCooks',
  quantads: 'QuantAds',
  quantmax: 'QuantMax',
  'sso-chooser': 'a Quant app',
};

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Your name and username',
  email: 'Your email address',
};

type Stage =
  | 'checking'
  | 'login-required'
  | 'consent'
  | 'working'
  | 'error';

function isAllowedRedirectUri(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;
    // Only Quant-owned hosts (or localhost for dev).
    return (
      url.hostname === 'quantmail.in' ||
      url.hostname.endsWith('.quantrinity.in') ||
      url.hostname.endsWith('.quant.ecosystem') ||
      url.hostname === 'localhost'
    );
  } catch {
    return false;
  }
}

function friendlyAppName(clientId: string | null): string {
  if (!clientId) return 'An app';
  return KNOWN_APPS[clientId] ?? clientId;
}

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>('checking');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params = useMemo(() => {
    const get = (k: string) => searchParams?.get(k);
    return {
      response_type: get('response_type'),
      client_id: get('client_id'),
      redirect_uri: get('redirect_uri'),
      scope: get('scope') || 'openid profile email',
      state: get('state') || '',
      code_challenge: get('code_challenge') || '',
      code_challenge_method: get('code_challenge_method') || '',
      nonce: get('nonce') || '',
    };
  }, [searchParams]);

  const scopes = useMemo(
    () => params.scope.split(' ').filter(Boolean),
    [params.scope],
  );

  const forwardToBackendAuthorize = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set('response_type', params.response_type || 'code');
    if (params.client_id) qs.set('client_id', params.client_id);
    if (params.redirect_uri) qs.set('redirect_uri', params.redirect_uri);
    qs.set('scope', params.scope);
    if (params.state) qs.set('state', params.state);
    if (params.code_challenge) qs.set('code_challenge', params.code_challenge);
    if (params.code_challenge_method) qs.set('code_challenge_method', params.code_challenge_method);
    if (params.nonce) qs.set('nonce', params.nonce);

    const res = await browserAuthSession.authenticatedFetch(
      `/api/oauth/authorize?${qs.toString()}`,
      { redirect: 'manual' },
      false,
    );

    if (res.status === 401) {
      // Session gone (or never existed) — login gate.
      const returnTo = encodeURIComponent(
        `/oauth/authorize?${qs.toString()}`,
      );
      router.replace(`/login?returnTo=${returnTo}`);
      setStage('login-required');
      return;
    }

    if (res.status >= 300 && res.status < 400) {
      // Consent already granted: backend redirected straight to the client
      // with ?code=…. Forward the browser; nothing sensitive in the URL.
      const location = res.headers.get('Location');
      if (location) {
        window.location.assign(location);
        return;
      }
      setError('The sign-in service answered without a destination. Please try again.');
      setStage('error');
      return;
    }

    if (res.status === 400) {
      const data = await res.json().catch(() => null);
      const desc =
        (data as { error_description?: string } | null)?.error_description ||
        'This sign-in request is invalid.';
      setError(desc);
      setStage('error');
      return;
    }

    // Anything else (including the backend's raw HTML consent fallback) →
    // show our native consent screen.
    setStage('consent');
  }, [params, router]);

  useEffect(() => {
    if (params.response_type !== 'code') {
      setError('This sign-in request is invalid (response_type must be "code").');
      setStage('error');
      return;
    }
    if (!params.client_id) {
      setError('This sign-in request is invalid (missing client_id).');
      setStage('error');
      return;
    }
    if (!isAllowedRedirectUri(params.redirect_uri)) {
      setError(
        'This sign-in request points at an address QuantMail does not recognise. ' +
          'Nothing was sent anywhere.',
      );
      setStage('error');
      return;
    }
    void forwardToBackendAuthorize();
  }, [params, forwardToBackendAuthorize]);

  const decide = useCallback(
    async (action: 'approve' | 'deny') => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await browserAuthSession.authenticatedFetch(
          '/api/oauth/consent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              client_id: params.client_id,
              redirect_uri: params.redirect_uri,
              scope: params.scope,
              state: params.state,
              code_challenge: params.code_challenge,
              code_challenge_method: params.code_challenge_method,
              nonce: params.nonce,
            }),
            redirect: 'manual',
          },
          false,
        );

        const location = res.headers.get('Location');
        if (location) {
          // ?code=… on approve, ?error=access_denied on deny. Either way the
          // URL carries no token — the app exchanges the code server-side.
          window.location.assign(location);
          return;
        }

        const data = await res.json().catch(() => null);
        setError(
          (data as { error_description?: string } | null)?.error_description ||
            'The sign-in service did not answer. Please try again.',
        );
        setStage('error');
      } catch {
        setError('The sign-in service is temporarily unavailable. Please try again.');
        setStage('error');
      } finally {
        setSubmitting(false);
      }
    },
    [params],
  );

  if (stage === 'checking' || stage === 'login-required') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6">
        <p className="text-sm text-neutral-400">
          {stage === 'checking' ? 'Checking your QuantMail session…' : 'Taking you to sign in…'}
        </p>
      </main>
    );
  }

  if (stage === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8">
          <h1 className="text-lg font-semibold text-white">Sign-in request invalid</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">{error}</p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-6 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black"
          >
            Back to QuantMail
          </button>
        </div>
      </main>
    );
  }

  // Consent — honest copy: app name + exact scopes, nothing invented.
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8">
        <h1 className="text-lg font-semibold text-white">
          {friendlyAppName(params.client_id)} wants to sign you in
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          You are signed in to QuantMail. {friendlyAppName(params.client_id)} is asking
          for permission to use your QuantMail account to sign you in. Your
          password stays with QuantMail — it is never shared.
        </p>

        <div className="mt-5 rounded-xl bg-neutral-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            It will be able to
          </p>
          <ul className="mt-2 space-y-1.5">
            {scopes.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm text-neutral-200">
                <span aria-hidden className="text-orange-400">•</span>
                {SCOPE_DESCRIPTIONS[s] ?? s}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void decide('approve')}
            className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            {submitting ? 'Working…' : 'Allow'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void decide('deny')}
            className="flex-1 rounded-xl border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-200 disabled:opacity-50"
          >
            Deny
          </button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-neutral-600">
          You can revoke this access any time from QuantMail Settings → Connected
          apps.
        </p>
      </div>
    </main>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black px-6">
          <p className="text-sm text-neutral-400">Loading…</p>
        </main>
      }
    >
      <AuthorizeContent />
    </Suspense>
  );
}
