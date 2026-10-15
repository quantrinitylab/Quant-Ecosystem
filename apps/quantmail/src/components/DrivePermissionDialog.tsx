'use client';

// ============================================================================
// QuantMail — Drive link permission detector dialog.
//
// Shown at send time when one or more Drive links in the message may not be
// openable by every recipient. Gmail parity ("Share and send?" prompt): the
// user grants view access, sends without access, or keeps editing. Copy is
// honest — access is only claimed on positive backend evidence; anything
// unverifiable is labeled as such, never as granted.
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import type { DrivePermissionIssue } from './drive-compose-share';
import { IconX, IconFolder } from './icons';

interface DrivePermissionDialogProps {
  isOpen: boolean;
  issues: DrivePermissionIssue[];
  busy: boolean;
  error: string | null;
  /** True when at least one issue has recipients the user can grant access to. */
  canGrant: boolean;
  onGrantAndSend: () => void;
  onSendWithout: () => void;
  onKeepEditing: () => void;
}

export function DrivePermissionDialog({
  isOpen,
  issues,
  busy,
  error,
  canGrant,
  onGrantAndSend,
  onSendWithout,
  onKeepEditing,
}: DrivePermissionDialogProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onKeepEditing}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          role="dialog"
          aria-modal="true"
          aria-label="Check Drive link access"
          className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] shadow-[0_24px_64px_rgba(0,0,0,0.62)] overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-[#2E7D32]/15 border border-[#2E7D32]/40 text-[#4CAF50] shadow-[0_0_10px_rgba(76,175,80,0.12)]">
                <IconFolder size={15} />
              </span>
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-[var(--quant-foreground)]">
                Check Drive link access
              </h3>
            </div>
            <button
              type="button"
              onClick={onKeepEditing}
              aria-label="Keep editing"
              className="grid size-11 place-items-center rounded-lg text-[var(--quant-muted-foreground)] transition-colors hover:text-[var(--quant-foreground)] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <IconX size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
              Some recipients may not be able to open the Drive links in this message. Grant
              them view access, or send anyway — recipients without access will see an error
              when they open the link.
            </p>

            {issues.map((issue, idx) => (
              <div
                key={`${issue.fileId ?? 'token'}-${idx}`}
                className="rounded-xl bg-[var(--quant-surface)] border border-white/[0.08] p-3 space-y-1"
              >
                <div className="text-xs font-semibold text-[var(--quant-foreground)] truncate">
                  {issue.fileName}
                </div>
                {issue.broken ? (
                  <div className="text-xs text-[#F87171] leading-relaxed">
                    This link no longer works
                    {issue.brokenMessage ? ` — ${issue.brokenMessage}` : '.'} Recipients won&apos;t
                    be able to open it.
                  </div>
                ) : (
                  <>
                    {issue.missingEmails.length > 0 && (
                      <div className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                        <span className="text-[#FBBF24] font-medium">Doesn&apos;t have access: </span>
                        {issue.missingEmails.join(', ')}
                      </div>
                    )}
                    {issue.unverifiable && (
                      <div className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                        Sharing couldn&apos;t be fully verified for this file — some recipients
                        may not have access.
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 px-3 py-2 text-xs text-[#F87171] leading-relaxed"
              >
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-2.5 bg-[var(--quant-surface)]">
            <button
              type="button"
              onClick={onKeepEditing}
              disabled={busy}
              className="min-h-touch rounded-xl px-3 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:opacity-40"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={onSendWithout}
              disabled={busy}
              className="min-h-touch rounded-xl px-3 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:opacity-40"
            >
              Send without access
            </button>
            <button
              type="button"
              onClick={onGrantAndSend}
              disabled={busy || !canGrant}
              title={canGrant ? 'Grant view access and send' : 'No recipients to grant access to'}
              className="min-h-touch rounded-xl bg-[#2E7D32] px-4 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.6)] transition-colors hover:bg-[#388E3C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-surface)] focus-visible:ring-[#4CAF50] disabled:opacity-40"
            >
              {busy ? 'Granting…' : 'Grant access & send'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
