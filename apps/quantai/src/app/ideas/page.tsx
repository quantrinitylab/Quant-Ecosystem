'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '../../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

type IdeaStatus = 'new' | 'saved' | 'dismissed';

interface Idea {
  id: string;
  title: string;
  description: string;
  emoji: string;
  status: IdeaStatus;
  createdAt: string;
}

const TABS: { id: IdeaStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'saved', label: 'Saved' },
  { id: 'dismissed', label: 'Dismissed' },
];

const EMOJI_PRESETS = ['💡', '🎨', '📥', '🖥️', '🎯', '⚡', '🔍', '📝', '🚀', '❤️'];

const EMPTY_COPY: Record<IdeaStatus, { title: string; body: string }> = {
  new: {
    title: 'No ideas yet',
    body: 'Quanty will propose ideas here based on your activity. You can also jot down your own below — nothing is fabricated, every card is real.',
  },
  saved: {
    title: 'Nothing saved',
    body: 'Ideas you save will live here for later.',
  },
  dismissed: {
    title: 'Nothing dismissed',
    body: 'Ideas you dismiss land here. You can restore or delete them permanently.',
  },
};

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const token = getAuthToken();
  const res = await apiFetchRaw(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    return { ok: false, error: json.error?.message || json.error || `Request failed (${res.status})` };
  }
  return { ok: true, data: json.data };
}

export default function IdeasPage() {
  const [tab, setTab] = useState<IdeaStatus>('new');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_PRESETS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (status: IdeaStatus) => {
    setLoading(true);
    setError(null);
    const result = await api(`/api/ideas?status=${status}`);
    if (result.ok) {
      setIdeas((result.data as Idea[]) ?? []);
    } else {
      setError(result.error ?? 'Could not load ideas.');
      setIdeas([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const transition = async (id: string, action: 'save' | 'dismiss' | 'restore' | 'delete') => {
    setActing(id);
    const path = action === 'delete' ? `/api/ideas/${id}` : `/api/ideas/${id}/${action}`;
    const result = await api(path, { method: action === 'delete' ? 'DELETE' : 'POST' });
    setActing(null);
    if (!result.ok) {
      setError(result.error ?? 'Action failed.');
      return;
    }
    // Optimistic: drop the card from the current tab (it moved to another status,
    // or was deleted). Refresh keeps every tab honest.
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  };

  const createIdea = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const result = await api('/api/ideas', {
      method: 'POST',
      body: JSON.stringify({ title: trimmed, description: description.trim(), emoji }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not create the idea.');
      return;
    }
    setTitle('');
    setDescription('');
    setEmoji(EMOJI_PRESETS[0]);
    setComposerOpen(false);
    if (tab !== 'new') setTab('new');
    else load('new');
  };

  const empty = EMPTY_COPY[tab];

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        {/* Header: Quanty avatar + status, like the Muse app */}
        <div className="flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-4xl shadow-lg shadow-fuchsia-900/40" aria-hidden="true">
            💡
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-lg font-semibold">Quanty</span>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
              Proactive ideas
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold">Ideas</h1>
          <p className="mt-1 text-center text-sm text-zinc-500">
            Suggestions from Quanty based on your activity — save the good ones, dismiss the rest.
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex rounded-full bg-zinc-900 p-1" role="tablist" aria-label="Idea status">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Composer toggle */}
        <button
          onClick={() => setComposerOpen((v) => !v)}
          className="mt-4 w-full rounded-2xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
        >
          {composerOpen ? '− Close' : '+ Propose your own idea'}
        </button>

        {composerOpen && (
          <div className="mt-3 rounded-2xl bg-zinc-900 p-4">
            <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Pick an emoji">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  role="radio"
                  aria-checked={emoji === e}
                  onClick={() => setEmoji(e)}
                  className={`rounded-xl px-2 py-1 text-2xl transition ${
                    emoji === e ? 'bg-zinc-700 ring-2 ring-fuchsia-500' : 'hover:bg-zinc-800'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Idea title"
              maxLength={200}
              className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-fuchsia-500"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is it about? (optional)"
              maxLength={2000}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl bg-zinc-800 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-fuchsia-500"
            />
            <button
              onClick={createIdea}
              disabled={!title.trim() || saving}
              className="mt-3 w-full rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-semibold transition hover:bg-fuchsia-500 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Add idea'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Cards */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">
              Loading ideas…
            </div>
          ) : ideas.length === 0 ? (
            <div className="rounded-2xl bg-zinc-900 p-8 text-center">
              <div className="text-3xl" aria-hidden="true">💭</div>
              <div className="mt-2 font-semibold">{empty.title}</div>
              <div className="mt-1 text-sm text-zinc-500">{empty.body}</div>
            </div>
          ) : (
            ideas.map((idea) => (
              <article key={idea.id} className="rounded-2xl bg-zinc-900 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-2xl" aria-hidden="true">
                    {idea.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold leading-snug">{idea.title}</h2>
                    {idea.description && (
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{idea.description}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {tab === 'new' && (
                    <>
                      <button
                        onClick={() => transition(idea.id, 'save')}
                        disabled={acting === idea.id}
                        className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium transition hover:bg-zinc-700 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => transition(idea.id, 'dismiss')}
                        disabled={acting === idea.id}
                        className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  {tab === 'saved' && (
                    <button
                      onClick={() => transition(idea.id, 'dismiss')}
                      disabled={acting === idea.id}
                      className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  )}
                  {tab === 'dismissed' && (
                    <>
                      <button
                        onClick={() => transition(idea.id, 'restore')}
                        disabled={acting === idea.id}
                        className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium transition hover:bg-zinc-700 disabled:opacity-40"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => transition(idea.id, 'delete')}
                        disabled={acting === idea.id}
                        className="flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-950 hover:text-red-300 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
