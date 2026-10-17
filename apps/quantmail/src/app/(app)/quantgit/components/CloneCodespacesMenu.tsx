'use client';

// ============================================================================
// QuantGit — Code Dropdown: Clone with HTTPS
// ----------------------------------------------------------------------------
// QM-UIUX-067: this menu previously offered four fabricated clone transports
// (an SSH URL with no SSH git server behind it, a GitHub-CLI clone command
// that targets github.com, a nonexistent `@quant/cli`, and a `/git/` URL the
// git server never served), plus a toast-only cloud-dev-env tab and a ZIP
// download that
// pointed at a route that does not exist. The QuantGit backend does run a
// real git smart-HTTP server (mounted at /api/code/gitd) and the repository
// API returns that endpoint as the repo's cloneUrl — so this menu now offers
// exactly that one real transport, verbatim, and says so plainly when the API
// did not provide a clone URL.
// ============================================================================

import React, { useState } from 'react';

export interface CloneCodespacesMenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** Clone URL exactly as returned by the repository API ('' when unknown). */
  cloneUrl: string;
  showToast?: (msg: string) => void;
}

export const CloneCodespacesMenu: React.FC<CloneCodespacesMenuProps> = ({
  isOpen,
  onClose,
  cloneUrl,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopied(true);
    showToast?.('Copied to clipboard!');
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const copyButtonLabel = copied ? 'Copied!' : 'Copy';

  return (
    <>
      {/* Invisible backdrop to dismiss when clicking outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      {/* Popover Menu Card */}
      <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] shadow-2xl overflow-hidden z-50 text-xs text-[#E6EDF3] animate-in fade-in zoom-in-95 duration-100">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-[#E6EDF3] flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-[#58A6FF]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Clone with HTTPS
            </span>
          </div>

          {cloneUrl ? (
            <>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  aria-label="Clone URL"
                  value={cloneUrl}
                  className="w-full bg-[#0D1117] border border-[#30363D] rounded-md py-1.5 pl-3 pr-16 text-[11px] font-mono text-[#E6EDF3] outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(cloneUrl)}
                  className="absolute right-1.5 px-2 py-1 rounded hover:bg-[#21262D] text-[#8D96A0] hover:text-[#E6EDF3] transition-colors"
                  title="Copy clone URL"
                >
                  {copyButtonLabel}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-md py-1.5 px-2.5 font-mono text-[11px] text-[#E6EDF3] select-all truncate">
                  git clone {cloneUrl}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(`git clone ${cloneUrl}`)}
                  className="px-3 py-1.5 rounded-md bg-[#21262D] hover:bg-[#30363D] text-white font-bold text-xs transition-colors shrink-0 border border-[#30363D]"
                  title="Copy git clone command"
                >
                  {copyButtonLabel}
                </button>
              </div>

              <p className="text-[11px] text-[#8D96A0]">
                When Git asks for credentials, use your Quant account or a personal access token;
                private repositories also require repository access.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-[#8D96A0]">
              A clone URL isn&rsquo;t available for this repository yet, so it can&rsquo;t be cloned
              from the command line right now.
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default CloneCodespacesMenu;
