'use client';

// ============================================================================
// DisplaySettingsSync — the account-roaming display settings, applied on
// every authenticated session start.
//
// Settings set on one device must reach the others (queue 2026-10-12 P2
// [settings]): without this, a phone-set Obsidian + compact theme would sit
// in the phone's `localStorage` while the desktop kept painting defaults
// until the user happened to open Settings there. One reconciliation pass
// per mount — `AppProviders` lives in the root layout, so that is once per
// session in practice — keeps the boot cache current with the account.
//
// Renders nothing, surfaces nothing: a signed-out visitor gets a silent
// 401 skip, and a failed round trip leaves the local copy alone for the next
// pass. The settings page runs the same pass itself and reports its own
// result, so this component never toasts.
// ============================================================================

import { useEffect, useRef } from 'react';
import { syncDisplaySettingsWithAccount } from '../lib/display-settings';

export function DisplaySettingsSync() {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void syncDisplaySettingsWithAccount();
  }, []);
  return null;
}
