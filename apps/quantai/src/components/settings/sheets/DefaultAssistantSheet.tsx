// ============================================================================
// DefaultAssistantSheet — "Set as default assistant".
// A web app cannot set itself as the OS default assistant, so this sheet is
// honest: platform-specific instructions instead of a dead button.
// ============================================================================
import React from 'react';
import { SettingsSheet, SheetNote } from '../SettingsSheet';
import { CheckIcon } from '../SettingsIcons';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[13px] font-semibold text-blue-400">
        {n}
      </span>
      <span className="text-[14px] leading-relaxed text-white/75">{children}</span>
    </li>
  );
}

export function DefaultAssistantSheet({ onClose }: { onClose: () => void }) {
  return (
    <SettingsSheet
      title="Set as default assistant"
      subtitle="Make Quanty your go-to assistant."
      onClose={onClose}
      testId="default-assistant-sheet"
    >
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-white">
            Android
          </h3>
          <ol className="space-y-2.5">
            <Step n={1}>Open <strong>Settings</strong> on your phone.</Step>
            <Step n={2}>Go to <strong>Apps → Default apps → Digital assistant app</strong>.</Step>
            <Step n={3}>Choose <strong>QuantAI</strong> (after installing it to your home screen).</Step>
            <Step n={4}>Grant the assist &amp; voice-input permissions it asks for.</Step>
          </ol>
        </div>
        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-white">iPhone</h3>
          <p className="text-[14px] leading-relaxed text-white/60">
            iOS does not let third-party apps replace Siri as the default assistant. You can still
            add QuantAI to your home screen and open it with one tap.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-white">Desktop</h3>
          <p className="text-[14px] leading-relaxed text-white/60">
            Pin the QuantAI tab in your browser for quick access. A native desktop assistant
            integration is on the roadmap.
          </p>
        </div>
      </div>
      <SheetNote>
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          <CheckIcon /> No fake system changes:
        </span>{' '}
        browsers can't change OS defaults, so we show you the real steps instead.
      </SheetNote>
    </SettingsSheet>
  );
}
