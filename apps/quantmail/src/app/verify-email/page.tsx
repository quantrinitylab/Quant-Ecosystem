'use client';

// ============================================================================
// QuantMail — email verification landing page.
// /verify-email?token=… — spends the single-use link from the verification
// mail and shows an honest outcome. No session required (it is a link click).
// ============================================================================

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Verifying your address…');

  useEffect(() => {
    const token = searchParams?.get('token');
    if (!token) {
      setStatus('error');
      setMessage('That verification link is not valid. Request a new one from Settings.');
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' },
        );
        const data = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { message?: string };
          error?: { message?: string };
        } | null;
        if (res.ok && data?.success) {
          setStatus('ok');
          setMessage(data?.data?.message || 'Your email address is verified.');
        } else {
          setStatus('error');
          setMessage(
            data?.error?.message ||
              'That verification link has expired or was already used. Request a new one from Settings.',
          );
        }
      } catch {
        setStatus('error');
        setMessage('The verification service is temporarily unavailable. Please try again.');
      }
    })();
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-8 text-center">
        <h1 className="text-lg font-semibold text-white">Email verification</h1>
        <p
          className={`mt-3 text-sm leading-relaxed ${
            status === 'error' ? 'text-red-400' : 'text-neutral-400'
          }`}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
        {status !== 'working' && (
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-6 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black"
          >
            Continue to sign in
          </button>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black px-6">
          <p className="text-sm text-neutral-400">Loading…</p>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
