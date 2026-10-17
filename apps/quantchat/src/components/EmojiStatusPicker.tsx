'use client';

// ===========================================================================
// QuantChat — EmojiStatusPicker (QC-F-466)
// ===========================================================================
//
// Lets the user set / replace / clear their expiring emoji status. The
// choices come ONLY from the first-party QC-F-336 catalog
// (CUSTOM_EMOJI_PACKS) — the same manifest the badge renders from and the
// backend mirrors — so a key picked here is always a key the server
// accepts and every client can render. Durations are the closed set the
// backend accepts ('1h' | '24h' | '7d'); the client never computes or
// sends an absolute expiry.
//
// Saving goes through the caller's onSave (profile page →
// apiClient.updateProfile), which sends `{ emojiStatus: { key, duration } }`
// to set, or `{ emojiStatus: null }` to clear. This component renders the
// picker controls only — no fake save of its own.

import React, { useState } from 'react';
import { CUSTOM_EMOJI_PACKS } from '../lib/custom-emoji';
import type { EmojiStatusView } from '../types';

export type EmojiStatusDuration = '1h' | '24h' | '7d';

export const EMOJI_STATUS_DURATION_OPTIONS: ReadonlyArray<{
  value: EmojiStatusDuration;
  label: string;
}> = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

function remainingLabel(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

export function EmojiStatusPicker({
  current,
  onSave,
  saving = false,
}: {
  current?: EmojiStatusView | null;
  onSave: (next: { key: string; duration: EmojiStatusDuration } | null) => void;
  saving?: boolean;
}) {
  const pack = CUSTOM_EMOJI_PACKS[0];
  const [selectedKey, setSelectedKey] = useState<string | null>(current?.key ?? null);
  const [duration, setDuration] = useState<EmojiStatusDuration>('24h');

  if (!pack) return null;

  const remaining = current ? remainingLabel(current.expiresAt) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="emoji-status-picker">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-300">Status</span>
        {current && remaining && (
          <span className="text-xs text-gray-400">Current status · {remaining}</span>
        )}
      </div>

      <div className="grid grid-cols-6 gap-2" role="listbox" aria-label="Choose a status">
        {pack.entries.map((entry) => {
          const key = `${pack.id}:${entry.name}`;
          const selected = selectedKey === key;
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={entry.alt}
              title={entry.alt}
              data-status-key={key}
              onClick={() => setSelectedKey(key)}
              className={`flex items-center justify-center rounded-xl border p-2 transition-colors ${
                selected
                  ? 'border-purple-500 bg-purple-500/20'
                  : 'border-white/10 bg-white/5 hover:border-white/25'
              }`}
            >
              <img src={entry.assetUrl} alt={entry.alt} width={24} height={24} loading="lazy" />
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <span>Keep for</span>
        <select
          aria-label="Status duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value as EmojiStatusDuration)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-white outline-none focus:border-purple-500"
        >
          {EMOJI_STATUS_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-900">
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !selectedKey}
          onClick={() => selectedKey && onSave({ key: selectedKey, duration })}
          className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Set status
        </button>
        {current && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSelectedKey(null);
              onSave(null);
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-gray-200 disabled:opacity-50"
          >
            Clear status
          </button>
        )}
      </div>
    </div>
  );
}
