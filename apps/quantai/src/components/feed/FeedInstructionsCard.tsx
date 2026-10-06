'use client';

import { useState } from 'react';

interface FeedInstructionsCardProps {
  initialPrompt: string | null;
  onSave: (prompt: string) => Promise<void>;
  saving: boolean;
}

/**
 * Editable "Feed instructions" card — Muse S5 parity.
 * The prompt powers the scheduled feed generator.
 */
export default function FeedInstructionsCard({ initialPrompt, onSave, saving }: FeedInstructionsCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [error, setError] = useState<string | null>(null);

  const prompt = initialPrompt ?? 'Make me a feed about my interests. Keep the tone clear and direct. Ensure it is quick to skim. Try to avoid clickbait.';

  const handleSave = async () => {
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save instructions.');
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xl font-semibold text-white">Feed instructions</div>
      <p className="mt-1 text-sm text-white/50">
        Your feed is powered by the instructions below. Any edits you make to this prompt will
        apply to future posts on the feed.
      </p>

      {editing ? (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
            placeholder="Make me a feed about my interests…"
            aria-label="Feed instructions"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setEditing(false);
                setDraft(initialPrompt ?? '');
                setError(null);
              }}
              className="flex-1 rounded-full bg-zinc-800 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              className="flex-1 rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setDraft(initialPrompt ?? prompt);
            setEditing(true);
          }}
          className="mt-4 block w-full rounded-2xl bg-zinc-900 p-4 text-left transition hover:bg-zinc-800"
        >
          <p className="line-clamp-2 text-sm text-white/70">{prompt}</p>
          <p className="mt-2 text-xs font-medium text-blue-400">Tap to edit</p>
        </button>
      )}
    </div>
  );
}
