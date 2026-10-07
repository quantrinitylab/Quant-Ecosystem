// ============================================================================
// HelpSheet — help & support.
// Real FAQ content about the actual product + real contact path.
// No invented help-center URL.
// ============================================================================
import React, { useState } from 'react';
import { SettingsSheet, SheetNote } from '../SettingsSheet';
import { ChevronRightIcon } from '../SettingsIcons';

const SUPPORT_EMAIL = 'support@quantmail.in';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Quanty?',
    a: 'Quanty is the AI agent inside QuantAI. Ask it to work across your Quant apps — mail, calendar, files, and code — and it plans the steps, asks before doing anything destructive, and shows its progress live.',
  },
  {
    q: 'How do I sign in?',
    a: 'Use "Continue with Quant Account" on the login screen. One QuantID works across the whole ecosystem — QuantMail, QuantChat, and QuantAI.',
  },
  {
    q: 'Which AI models can I use?',
    a: 'Open the model picker in chat to switch models. Third-party models (marked "Your key") need your own provider API key; Quant-1 is served by the platform.',
  },
  {
    q: 'Is my data used for training?',
    a: 'Your conversations are used to serve you, not to train public models. Use Data controls in Settings to export or request deletion of your data.',
  },
  {
    q: 'Quanty asked for approval — what does that mean?',
    a: 'Before Quanty sends an email, deletes files, or merges code, it asks you to approve the exact action. Nothing destructive runs without your tap.',
  },
  {
    q: 'The app looks broken. What should I try first?',
    a: 'Hard-refresh the page, then sign out and back in from Settings. If it persists, use "Report an issue" in Settings with diagnostics included.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-[14px] font-medium text-white">{q}</span>
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <ChevronRightIcon />
        </span>
      </button>
      {open && <p className="px-4 pb-4 text-[13px] leading-relaxed text-white/60">{a}</p>}
    </div>
  );
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <SettingsSheet
      title="Help & support"
      subtitle="Answers, and a human when you need one."
      onClose={onClose}
      testId="help-sheet"
    >
      <div className="space-y-2.5">
        {FAQS.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </div>
      <a
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[QuantAI] Support request')}`}
        className="mt-4 block w-full rounded-2xl bg-blue-500 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-blue-400"
      >
        Contact support
      </a>
      <SheetNote>
        Support is reached at {SUPPORT_EMAIL}. We aim to reply within one business day.
      </SheetNote>
    </SettingsSheet>
  );
}
