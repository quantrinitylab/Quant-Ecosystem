// ============================================================================
// AddToHomeScreenSheet — PWA install.
// Uses the real beforeinstallprompt flow when the browser offers it;
// otherwise honest per-platform instructions (no dead "Install" button).
// ============================================================================
import React, { useState } from 'react';
import { SettingsSheet, SheetNote, SheetPrimaryButton } from '../SettingsSheet';
import { usePwaInstall } from '../../../hooks/usePwaInstall';
import { CheckIcon } from '../SettingsIcons';

export function AddToHomeScreenSheet({ onClose }: { onClose: () => void }) {
  const { canInstall, isInstalled, platform, promptInstall } = usePwaInstall();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleInstall() {
    setBusy(true);
    try {
      const result = await promptInstall();
      setOutcome(
        result === 'accepted'
          ? 'Installing — look for QuantAI on your home screen.'
          : result === 'dismissed'
            ? 'Install dismissed. You can try again anytime.'
            : 'Install is not available right now.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSheet
      title="Add to home screen"
      subtitle="Open QuantAI like a native app."
      onClose={onClose}
      testId="add-to-home-sheet"
    >
      {isInstalled ? (
        <>
          <p className="flex items-center gap-2 text-[15px] text-emerald-400">
            <CheckIcon /> QuantAI is already installed on this device.
          </p>
          <SheetNote>Launch it from your home screen or app drawer for the full-screen experience.</SheetNote>
        </>
      ) : canInstall ? (
        <>
          <p className="mb-4 text-[15px] leading-relaxed text-white/75">
            Your browser can install QuantAI right now — one tap, no app store.
          </p>
          <SheetPrimaryButton onClick={handleInstall} disabled={busy} testId="pwa-install-now">
            {busy ? 'Installing…' : 'Install QuantAI'}
          </SheetPrimaryButton>
          {outcome && <p className="mt-3 text-sm text-white/60">{outcome}</p>}
        </>
      ) : (
        <>
          <p className="mb-3 text-[15px] text-white/75">
            Your browser didn't offer a one-tap install, but you can still add QuantAI manually:
          </p>
          {platform === 'ios' ? (
            <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-white/70">
              <li>Tap the <strong>Share</strong> button in Safari's toolbar.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
          ) : platform === 'android' ? (
            <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-white/70">
              <li>Tap the <strong>⋮ menu</strong> in Chrome.</li>
              <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
              <li>Confirm with <strong>Install</strong>.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-white/70">
              <li>In Chrome/Edge, click the <strong>install icon</strong> in the address bar.</li>
              <li>Or open the <strong>⋮ menu → Install QuantAI…</strong></li>
              <li>On Safari (Mac): <strong>File → Add to Dock</strong>.</li>
            </ol>
          )}
          <SheetNote>
            One-tap install appears automatically once the PWA manifest is served — until then,
            the manual steps above work everywhere.
          </SheetNote>
        </>
      )}
    </SettingsSheet>
  );
}
