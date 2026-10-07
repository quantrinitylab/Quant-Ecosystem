'use client';

// ============================================================================
// PermissionsSection — per-tool allow/ask/deny toggles.
// Persisted server-side via PUT /api/quanty/permissions. Destructive tools
// default to "ask"; unknown tools are denied by the backend.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/auth';
import type { ToolPolicy, ToolPolicyData } from './types';

const POLICY_ORDER: ToolPolicy[] = ['allow', 'ask', 'deny'];

export default function PermissionsSection() {
  const [tools, setTools] = useState<ToolPolicyData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quanty/permissions', { headers: getAuthHeaders() })
      .then(async (r) => {
        const j = await r.json();
        if (!cancelled) {
          if (j.success) setTools(j.data.tools);
          else setError(j.error?.message ?? 'Could not load permissions');
        }
      })
      .catch(() => !cancelled && setError('Could not load permissions'));
    return () => {
      cancelled = true;
    };
  }, []);

  const setPolicy = async (id: string, policy: ToolPolicy) => {
    setSaving(id);
    try {
      const r = await fetch('/api/quanty/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ tools: [{ id, policy }] }),
      });
      const j = await r.json();
      if (j.success) {
        setTools((t) => (t ?? []).map((x) => (x.id === id ? { ...x, policy } : x)));
      } else {
        setError(j.error?.message ?? 'Could not save permission');
      }
    } catch {
      setError('Could not save permission');
    } finally {
      setSaving(null);
    }
  };

  if (error) return <p className="text-[14px] text-[#FF453A]">{error}</p>;
  if (!tools) return <p className="text-[14px] text-white/50">Loading…</p>;

  return (
    <div>
      <p className="mb-3 text-[13px] text-white/50">
        Control what Quanty may do on your behalf. Destructive actions always ask first unless you allow them.
      </p>
      <ul className="divide-y divide-white/10">
        {tools.map((t) => (
          <li key={t.id} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-[15px] text-white">
                  {t.name}
                  {t.destructive && (
                    <span className="ml-2 rounded-full bg-[#FF453A]/15 px-2 py-0.5 text-[11px] text-[#FF453A]">
                      destructive
                    </span>
                  )}
                </p>
                <p className="text-[13px] text-white/50">{t.description}</p>
              </div>
            </div>
            <div
              className="mt-2 inline-flex rounded-full bg-white/10 p-1"
              role="group"
              aria-label={`Permission for ${t.name}`}
            >
              {POLICY_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={saving === t.id}
                  onClick={() => setPolicy(t.id, p)}
                  aria-pressed={t.policy === p}
                  className={`rounded-full px-4 py-1.5 text-[13px] capitalize transition-colors disabled:opacity-50 ${
                    t.policy === p ? 'bg-[#0A84FF] text-white' : 'text-white/60'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
