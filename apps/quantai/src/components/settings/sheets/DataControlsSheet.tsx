// ============================================================================
// DataControlsSheet — export & delete my data.
// Export: POST /api/quanty/data/export → real JSON download of what QuantAI
//   holds about you, with an honest coverage manifest.
// Delete: DELETE /api/quanty/data requires typing DELETE to confirm, then
//   honestly reports that self-serve deletion isn't live yet and routes you
//   to support — never a fake "deleted" state for an irreversible action.
// ============================================================================
import React, { useState } from 'react';
import {
  SettingsSheet,
  SheetNote,
  SheetPrimaryButton,
  SheetDangerButton,
} from '../SettingsSheet';
import { getAuthToken } from '../../../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

const SUPPORT_EMAIL = 'support@quantmail.in';

async function authedFetch(path: string, init: RequestInit) {
  const token = getAuthToken();
  const res = await apiFetchRaw(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export function DataControlsSheet({ onClose }: { onClose: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function handleExport() {
    setMessage(null);
    setBusy('export');
    try {
      const res = await authedFetch('/api/quanty/data/export', { method: 'POST', body: '{}' });
      if (res.status === 401) {
        setMessage({ kind: 'error', text: 'You are signed out. Sign in and try again.' });
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setMessage({ kind: 'error', text: json?.error ?? 'Export failed. Please try again.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quanty-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ kind: 'info', text: 'Your data export has been downloaded.' });
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setMessage(null);
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setMessage({ kind: 'error', text: 'Type DELETE to confirm.' });
      return;
    }
    setBusy('delete');
    try {
      const res = await authedFetch('/api/quanty/data', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setMessage({ kind: 'info', text: 'Your deletion request has been received.' });
        setConfirmingDelete(false);
      } else {
        setMessage({
          kind: 'error',
          text: json?.error ?? 'Deletion is not available right now.',
        });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsSheet
      title="Data controls"
      subtitle="Your data, your call."
      onClose={onClose}
      testId="data-controls-sheet"
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-white/[0.04] p-4">
          <h3 className="text-[15px] font-semibold text-white">Export my data</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">
            Download a JSON copy of the data QuantAI holds about you, with a manifest of what's
            included.
          </p>
          <div className="mt-3">
            <SheetPrimaryButton onClick={handleExport} disabled={busy !== null} testId="data-export">
              {busy === 'export' ? 'Preparing…' : 'Download export'}
            </SheetPrimaryButton>
          </div>
        </div>

        <div className="rounded-2xl bg-red-500/[0.06] p-4">
          <h3 className="text-[15px] font-semibold text-red-300">Delete my data</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">
            Request deletion of your QuantAI data. This is irreversible.
          </p>
          {!confirmingDelete ? (
            <div className="mt-3">
              <SheetDangerButton onClick={() => setConfirmingDelete(true)} testId="data-delete-start">
                Delete my data…
              </SheetDangerButton>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[13px] text-white/60">
                  Type <strong className="text-white">DELETE</strong> to confirm
                </span>
                <input
                  type="text"
                  value={confirmText}
                  data-testid="data-delete-confirm"
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-white/20 focus:border-red-500/60 focus:outline-none"
                  placeholder="DELETE"
                />
              </label>
              <SheetDangerButton
                onClick={handleDelete}
                disabled={busy !== null}
                testId="data-delete-confirm-btn"
              >
                {busy === 'delete' ? 'Requesting…' : 'Confirm deletion'}
              </SheetDangerButton>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setConfirmText('');
                  setMessage(null);
                }}
                className="w-full py-2 text-sm text-white/60 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <p
          data-testid="data-controls-message"
          className={`mt-3 text-sm ${message.kind === 'error' ? 'text-red-400' : 'text-emerald-400'}`}
        >
          {message.text}
        </p>
      )}

      <SheetNote>
        Need help with your data? Write to{' '}
        <a className="text-blue-400 underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        .
      </SheetNote>
    </SettingsSheet>
  );
}
