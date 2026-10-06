'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '../../lib/auth';

interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'tracking' | 'done';
  completedAt: string | null;
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  category: string;
  source: string;
}

const CATEGORIES = [
  { id: 'health', label: 'Health', emoji: '❤️' },
  { id: 'relationships', label: 'Relationships', emoji: '👥' },
  { id: 'finance', label: 'Finance', emoji: '💲' },
  { id: 'custom', label: 'Custom', emoji: '✨' },
] as const;

function categoryLabel(category: string): string {
  const found = CATEGORIES.find((c) => c.id === category);
  return found ? `${found.emoji} ${found.label}` : category;
}

async function api(path: string, method: string, body?: unknown): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = getAuthToken();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

function GoalRow({
  goal,
  onToggle,
  onDelete,
  toggling,
}: {
  goal: Goal;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const done = goal.status === 'done';
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        aria-label={done ? `Reopen goal: ${goal.title}` : `Complete goal: ${goal.title}`}
        className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
          done ? 'bg-white/20 border-white/40' : 'border-white/30 hover:border-white/60'
        }`}
      >
        {done && (
          <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6.5 4.8 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-[15px] font-medium ${done ? 'line-through text-white/40' : 'text-white'}`}>
          {goal.title}
        </div>
        {goal.description && (
          <div className="text-[13px] text-white/50 mt-0.5 leading-snug">{goal.description}</div>
        )}
        <div className="text-[11px] text-white/35 mt-1">{categoryLabel(goal.category)}</div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete goal: ${goal.title}`}
        className="text-white/25 hover:text-red-400 text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Presentational goals sections (Muse S7 parity): Suggested-by-Quanty
 * proposals, Tracking section (green dot), Goals section (blue dot).
 * Pure props — no fetching — so it renders identically server and client.
 */
export function GoalsSections({
  tracking,
  done,
  proposals,
  togglingId,
  onToggle,
  onDelete,
  onAcceptProposal,
  onDismissProposal,
}: {
  tracking: Goal[];
  done: Goal[];
  proposals: Proposal[];
  togglingId: string | null;
  onToggle: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onAcceptProposal: (id: string) => void;
  onDismissProposal: (id: string) => void;
}) {
  return (
    <>
      {/* Suggested by Quanty (pending proposals) */}
      {proposals.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
            <h2 className="text-lg font-semibold">Suggested by Quanty</h2>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4">
            {proposals.map((p) => (
              <div key={p.id} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-white">{p.title}</div>
                  {p.description && (
                    <div className="text-[13px] text-white/50 mt-0.5 leading-snug">{p.description}</div>
                  )}
                  <div className="text-[11px] text-white/35 mt-1">{categoryLabel(p.category)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onAcceptProposal(p.id)}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => onDismissProposal(p.id)}
                  className="text-[13px] px-3 py-1.5 rounded-full text-white/50 hover:text-white/80 hover:bg-white/5"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tracking section (green dot) */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <h2 className="text-lg font-semibold">Tracking</h2>
        </div>
        <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4">
          {tracking.length === 0 ? (
            <div className="py-8 text-center">
              <div className="text-white/40 text-sm">No goals being tracked yet.</div>
              <div className="text-white/25 text-xs mt-1">Create one below to get started.</div>
            </div>
          ) : (
            tracking.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onToggle={() => onToggle(goal)}
                onDelete={() => onDelete(goal)}
                toggling={togglingId === goal.id}
              />
            ))
          )}
        </div>
      </section>

      {/* Goals section (blue dot) — completed */}
      {done.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <h2 className="text-lg font-semibold">Goals</h2>
          </div>
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4">
            {done.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onToggle={() => onToggle(goal)}
                onDelete={() => onDelete(goal)}
                toggling={togglingId === goal.id}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function GoalsPage() {
  const [tracking, setTracking] = useState<Goal[]>([]);
  const [done, setDone] = useState<Goal[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<string>('custom');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trackingRes, doneRes, proposalsRes] = await Promise.all([
        api('/api/goals?status=tracking', 'GET'),
        api('/api/goals?status=done', 'GET'),
        api('/api/goals/proposals', 'GET'),
      ]);
      if (!trackingRes.success || !doneRes.success || !proposalsRes.success) {
        throw new Error('Failed to load goals');
      }
      setTracking(trackingRes.data ?? []);
      setDone(doneRes.data ?? []);
      setProposals(proposalsRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleGoal = async (goal: Goal) => {
    setTogglingId(goal.id);
    const action = goal.status === 'tracking' ? 'complete' : 'reopen';
    const res = await api(`/api/goals/${goal.id}/${action}`, 'POST');
    setTogglingId(null);
    if (res.success) {
      await load();
    } else {
      setError(res.error || 'Could not update goal');
    }
  };

  const deleteGoal = async (goal: Goal) => {
    if (!window.confirm(`Delete goal "${goal.title}"?`)) return;
    const res = await api(`/api/goals/${goal.id}`, 'DELETE');
    if (res.success) {
      await load();
    } else {
      setError(res.error || 'Could not delete goal');
    }
  };

  const createGoal = async () => {
    setFormError(null);
    if (!formTitle.trim()) {
      setFormError('Please give your goal a title.');
      return;
    }
    setSaving(true);
    const res = await api('/api/goals', 'POST', {
      title: formTitle.trim(),
      description: formDescription.trim(),
      category: formCategory,
    });
    setSaving(false);
    if (res.success) {
      setFormTitle('');
      setFormDescription('');
      setFormCategory('custom');
      setShowCreate(false);
      await load();
    } else {
      setFormError(res.error || 'Could not create goal');
    }
  };

  const acceptProposal = async (id: string) => {
    const res = await api(`/api/goals/proposals/${id}/accept`, 'POST');
    if (res.success) {
      await load();
    } else {
      setError(res.error || 'Could not accept proposal');
    }
  };

  const dismissProposal = async (id: string) => {
    const res = await api(`/api/goals/proposals/${id}/dismiss`, 'POST');
    if (res.success) {
      await load();
    } else {
      setError(res.error || 'Could not dismiss proposal');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        {/* Header: avatar + status */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-3xl">
            🤖
          </div>
          <div className="mt-3 px-4 py-1.5 rounded-full bg-white/10 text-sm">
            <span className="font-semibold">Quanty</span>
            <span className="text-white/50 ml-2">Tracking your goals</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-6">Goals</h1>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-white/50 text-sm py-12 text-center">Loading goals…</div>
        ) : (
          <>
            <GoalsSections
              tracking={tracking}
              done={done}
              proposals={proposals}
              togglingId={togglingId}
              onToggle={toggleGoal}
              onDelete={deleteGoal}
              onAcceptProposal={acceptProposal}
              onDismissProposal={dismissProposal}
            />

            {/* Create a goal */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Create a goal</h2>
              {!showCreate ? (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="w-full rounded-2xl border border-dashed border-white/20 text-white/60 hover:text-white hover:border-white/40 py-4 text-sm font-medium transition-colors"
                >
                  + New goal
                </button>
              ) : (
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Goal title"
                    maxLength={200}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-400/60 mb-3"
                  />
                  <textarea
                    value={formDescription}
                    onChange={(e) => formDescription.length < 2000 && setFormDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-400/60 mb-3 resize-none"
                  />
                  <div className="text-xs text-white/50 mb-2">Category</div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFormCategory(c.id)}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                          formCategory === c.id
                            ? 'border-violet-400/70 bg-violet-500/15 text-white'
                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25'
                        }`}
                      >
                        <div className="text-lg mb-0.5">{c.emoji}</div>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {formError && <div className="text-red-300 text-xs mb-3">{formError}</div>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={createGoal}
                      disabled={saving}
                      className="flex-1 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
                    >
                      {saving ? 'Creating…' : 'Create goal'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
