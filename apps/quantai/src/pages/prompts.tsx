// ============================================================================
// QuantAI - Prompt Library Page
// Real, server-persisted prompt templates (GET/POST/PUT/DELETE /api/prompts).
// Create, edit, search, filter by category, favorite, copy, and track usage.
// ============================================================================

import { useMemo, useState } from 'react';
import {
  usePromptLibrary,
  type PromptTemplate,
  type CreatePromptInput,
} from '../hooks/usePromptLibrary';

interface FormState {
  id: string | null;
  title: string;
  content: string;
  category: string;
  tags: string;
}

const EMPTY_FORM: FormState = { id: null, title: '', content: '', category: 'general', tags: '' };

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function PromptsPage() {
  const {
    prompts,
    isLoading,
    error,
    reload,
    createPrompt,
    updatePrompt,
    deletePrompt,
    toggleFavorite,
    recordUsage,
  } = usePromptLibrary();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of prompts) set.add(p.category);
    return ['all', ...[...set].sort()];
  }, [prompts]);

  const visiblePrompts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prompts.filter((p) => {
      if (favoritesOnly && !p.isFavorite) return false;
      if (activeCategory !== 'all' && p.category !== activeCategory) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [prompts, search, activeCategory, favoritesOnly]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (p: PromptTemplate) => {
    setForm({
      id: p.id,
      title: p.title,
      content: p.content,
      category: p.category,
      tags: p.tags.join(', '),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim() || saving) return;
    setSaving(true);
    const payload: CreatePromptInput = {
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category.trim() || 'general',
      tags: parseTags(form.tags),
    };
    const result = form.id ? await updatePrompt(form.id, payload) : await createPrompt(payload);
    setSaving(false);
    if (result) closeForm();
  };

  const handleCopy = async (p: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(p.content);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((id) => (id === p.id ? null : id)), 1500);
      void recordUsage(p.id);
    } catch {
      // Clipboard unavailable (insecure context) — still record intent to use.
      void recordUsage(p.id);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Prompt Library</h1>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Save and reuse your best prompts. Synced across devices.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-[var(--quant-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Prompt
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts, content, or tags..."
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`px-3 py-2 rounded-lg text-sm border transition-colors whitespace-nowrap ${
            favoritesOnly
              ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
              : 'border-[var(--quant-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
          }`}
        >
          {favoritesOnly ? '★ Favorites' : '☆ Favorites'}
        </button>
      </div>

      {categories.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                activeCategory === c
                  ? 'bg-[var(--quant-surface-hover)] text-[var(--foreground)] border-[var(--quant-border)]'
                  : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      )}

      {/* States */}
      {isLoading && <p className="text-sm text-[var(--foreground-secondary)]">Loading prompts…</p>}

      {error && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
          <p>Could not load prompts: {error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 px-3 py-1 rounded-lg bg-red-500 text-white text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && visiblePrompts.length === 0 && (
        <div className="text-center py-16 text-[var(--foreground-secondary)]">
          <p className="text-lg mb-1">
            No prompts {prompts.length > 0 ? 'match your filters' : 'yet'}
          </p>
          <p className="text-sm">
            {prompts.length > 0
              ? 'Try clearing the search or category filter.'
              : 'Create your first reusable prompt to get started.'}
          </p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visiblePrompts.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium text-[var(--foreground)] truncate">{p.title}</h3>
                <span className="text-[10px] uppercase tracking-wide text-[var(--foreground-secondary)]">
                  {p.category} · used {p.usageCount}×
                </span>
              </div>
              <button
                type="button"
                aria-label={p.isFavorite ? 'Unfavorite' : 'Favorite'}
                aria-pressed={p.isFavorite}
                onClick={() => void toggleFavorite(p.id)}
                className={`text-lg leading-none ${p.isFavorite ? 'text-amber-500' : 'text-[var(--foreground-secondary)] hover:text-amber-500'}`}
              >
                {p.isFavorite ? '★' : '☆'}
              </button>
            </div>

            <p className="text-sm text-[var(--foreground-secondary)] line-clamp-3 whitespace-pre-wrap">
              {p.content}
            </p>

            {p.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--quant-surface-hover)] text-[var(--foreground-secondary)]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-auto pt-1">
              <button
                type="button"
                onClick={() => void handleCopy(p)}
                className="px-2.5 py-1 rounded-md text-xs bg-[var(--quant-accent)] text-white hover:opacity-90 transition-opacity"
              >
                {copiedId === p.id ? '✓ Copied' : '⧉ Copy'}
              </button>
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="px-2.5 py-1 rounded-md text-xs text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void deletePrompt(p.id)}
                className="px-2.5 py-1 rounded-md text-xs text-[var(--foreground-secondary)] hover:text-red-500 transition-colors ml-auto"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--quant-border)] bg-[var(--surface-elevated)] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {form.id ? 'Edit Prompt' : 'New Prompt'}
            </h2>

            <div className="space-y-1">
              <label className="text-xs text-[var(--foreground-secondary)]">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Code review checklist"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--foreground-secondary)]">Prompt</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Write the reusable prompt text..."
                rows={6}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)] resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-[var(--foreground-secondary)]">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="general"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--foreground-secondary)]">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="coding, review"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--quant-accent)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 rounded-lg text-sm text-[var(--foreground-secondary)] hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!form.title.trim() || !form.content.trim() || saving}
                className="px-4 py-2 rounded-lg text-sm bg-[var(--quant-accent)] text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PromptsPage;
