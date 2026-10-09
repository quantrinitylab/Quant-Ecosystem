// ============================================================================
// QuantGram — global voice-command host.
//
// The bar starts COLLAPSED as a small floating mic button and only expands on
// explicit user action. It previously defaulted to open, covering ~35% of the
// viewport on every page (mobile + desktop).
//
// QM-UIUX-015: the mic FAB is an authenticated-only control. It used to render
// unconditionally (mounted in _app with a hardcoded userId="guest"), so a blue
// microphone button sat unexplained on the anonymous welcome/login pages.
// Voice commands act on the signed-in user's account, so an anonymous visitor
// has nothing it can legitimately do — render nothing until a session exists.
// Must be mounted inside <AuthProvider> (it reads useAuth).
// ============================================================================

'use client';

import { useState } from 'react';
import { VoiceCommandBar } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';

export interface VoiceCommandHostProps {
  appId: string;
  userId?: string;
}

export function VoiceCommandHost({ appId, userId = 'guest' }: VoiceCommandHostProps) {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Anonymous (or still restoring a session): no unexplained controls.
  // The FAB appears only once a session is established, so a returning user
  // never sees it flash on the welcome page before sign-in either.
  if (!isAuthenticated) return null;

  return (
    <>
      {isOpen ? (
        <VoiceCommandBar appId={appId} userId={userId} onClose={() => setIsOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 p-3 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Open voice commands"
        >
          <span aria-hidden="true">&#127908;</span>
        </button>
      )}
    </>
  );
}
