// ============================================================================
// ReportIssueSheet — report a problem.
// There is no ticket backend yet, so this composes a real email to support
// with the issue pre-filled (subject, category, description, diagnostics).
// The user sends it from their own mail client — no fake ticket numbers.
// ============================================================================
import React, { useState } from 'react';
import { SettingsSheet, SheetNote, SheetPrimaryButton } from '../SettingsSheet';
import { CheckIcon } from '../SettingsIcons';

const SUPPORT_EMAIL = 'support@quantmail.in';

const CATEGORIES = [
  'Something looks broken',
  'Login / account problem',
  'Chat or AI quality',
  'Voice',
  'Performance',
  'Feature request',
  'Other',
] as const;

export function ReportIssueSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function diagnostics(): string {
    if (!includeDiagnostics || typeof window === 'undefined') return '';
    const lines = [
      `URL: ${window.location.href}`,
      `User agent: ${navigator.userAgent}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      `Time: ${new Date().toISOString()}`,
    ];
    return `\n\n---\nDiagnostics:\n${lines.join('\n')}`;
  }

  function buildMailto(): string {
    const subject = encodeURIComponent(`[QuantAI] ${category}`);
    const body = encodeURIComponent(
      `Describe the issue:\n${description.trim() || '(not provided)'}${diagnostics()}`,
    );
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function handleSend() {
    setError(null);
    if (description.trim().length < 10) {
      setError('Please describe the issue in a little more detail (min 10 characters).');
      return;
    }
    window.location.href = buildMailto();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        `To: ${SUPPORT_EMAIL}\nSubject: [QuantAI] ${category}\n\nDescribe the issue:\n${description.trim()}${diagnostics()}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — your browser blocked clipboard access.');
    }
  }

  return (
    <SettingsSheet
      title="Report an issue"
      subtitle="Tell us what went wrong. We read every report."
      onClose={onClose}
      testId="report-issue-sheet"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-white/60">Category</span>
          <select
            value={category}
            data-testid="report-category"
            onChange={(e) => setCategory(e.target.value)}
            className="w-full appearance-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-blue-500/60 focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-zinc-900">
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-white/60">
            What happened?
          </span>
          <textarea
            value={description}
            data-testid="report-description"
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="What were you doing when it happened? What did you expect?"
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-white/25 focus:border-blue-500/60 focus:outline-none"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-white/[0.04] p-4">
          <span className="text-[14px] text-white/80">Include diagnostics</span>
          <button
            type="button"
            role="switch"
            aria-checked={includeDiagnostics}
            data-testid="report-diagnostics-toggle"
            onClick={() => setIncludeDiagnostics((v) => !v)}
            className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
              includeDiagnostics ? 'justify-end bg-blue-500' : 'justify-start bg-white/15'
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-white" />
          </button>
        </label>
        <p className="-mt-2 text-[12px] text-white/40">
          Diagnostics include the page URL, device info, and timestamp — never passwords or tokens.
        </p>

        {error && (
          <p className="text-sm text-red-400" data-testid="report-error">
            {error}
          </p>
        )}

        <SheetPrimaryButton onClick={handleSend} testId="report-send">
          Send via email
        </SheetPrimaryButton>
        <button
          type="button"
          onClick={handleCopy}
          className="flex w-full items-center justify-center gap-1.5 py-2 text-sm text-white/60 hover:text-white"
        >
          {copied && <CheckIcon />}
          {copied ? 'Copied!' : 'Copy details instead'}
        </button>
      </div>
      <SheetNote>
        This opens your mail app addressed to {SUPPORT_EMAIL} with everything pre-filled — you
        press send. No account needed, no fake ticket created.
      </SheetNote>
    </SettingsSheet>
  );
}
