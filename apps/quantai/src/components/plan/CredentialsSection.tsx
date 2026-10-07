'use client';

// ============================================================================
// CredentialsSection — secure credentials store.
// Lists stored OAuth grants as METADATA ONLY (provider, masked account,
// scopes). Token values are never fetched, displayed, or logged. Revoke
// deletes the grant server-side after a confirm.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/auth';
import type { CredentialGrantData } from './types';
import { apiFetchRaw } from '@quant/api-client';

export default function CredentialsSection() {
  const [grants, setGrants] = useState<CredentialGrantData[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetchRaw('/api/quanty/credentials', { headers: getAuthHeaders() })
      .then(async (r) => {
        const j = await r.json();
        if (j.success) {
          setGrants(j.data.grants);
          setConfigured(j.data.configured);
        } else {
          setError(j.error?.message ?? 'Could not load credentials');
        }
      })
      .catch(() => setError('Could not load credentials'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string, provider: string) => {
    if (!window.confirm(`Revoke the ${provider} connection? Quanty will lose access until you reconnect.`)) return;
    setRevoking(id);
    try {
      const r = await apiFetchRaw(`/api/quanty/credentials/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const j = await r.json();
      if (j.success) {
        setGrants((g) => (g ?? []).filter((x) => x.id !== id));
      } else {
        setError(j.error?.message ?? 'Revoke failed');
      }
    } catch {
      setError('Revoke failed');
    } finally {
      setRevoking(null);
    }
  };

  if (error) return <p className="text-[14px] text-[#FF453A]">{error}</p>;
  if (grants === null) return <p className="text-[14px] text-white/50">Loading…</p>;

  if (!configured) {
    return (
      <p className="text-[14px] text-white/50">
        The secure credentials store is not connected yet. Connected accounts will appear here.
      </p>
    );
  }

  if (grants.length === 0) {
    return <p className="text-[14px] text-white/50">No connected accounts. Connect one from the Connectors screen.</p>;
  }

  return (
    <ul className="divide-y divide-white/10">
      {grants.map((g) => (
        <li key={g.id} className="flex items-center gap-3 py-3">
          <div className="flex-1">
            <p className="text-[15px] font-medium capitalize text-white">{g.provider}</p>
            <p className="text-[13px] text-white/50">{g.accountLabel}</p>
            {g.scopes.length > 0 && (
              <p className="mt-0.5 text-[12px] text-white/40">Scopes: {g.scopes.join(', ')}</p>
            )}
          </div>
          <button
            type="button"
            disabled={revoking === g.id}
            onClick={() => revoke(g.id, g.provider)}
            className="rounded-full bg-white/10 px-4 py-1.5 text-[14px] text-[#FF453A] disabled:opacity-50"
          >
            {revoking === g.id ? 'Revoking…' : 'Revoke'}
          </button>
        </li>
      ))}
    </ul>
  );
}
