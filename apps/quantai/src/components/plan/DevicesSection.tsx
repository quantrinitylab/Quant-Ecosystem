'use client';

// ============================================================================
// DevicesSection — devices linked to this account (via /api/devices).
// Honest list; no fake revoke — device removal is not supported by the
// backend yet, so no Revoke button is rendered.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

interface Device {
  id: string;
  name?: string;
  type?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export default function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchRaw('/api/devices', { headers: getAuthHeaders() })
      .then(async (r) => {
        const j = await r.json();
        if (!cancelled) {
          const items = j?.data?.devices ?? j?.data?.items ?? j?.devices ?? [];
          setDevices(Array.isArray(items) ? items : []);
        }
      })
      .catch(() => !cancelled && setError('Could not load devices'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-[14px] text-[#FF453A]">{error}</p>;
  if (!devices) return <p className="text-[14px] text-white/50">Loading…</p>;
  if (devices.length === 0) {
    return <p className="text-[14px] text-white/50">No devices linked to this account yet.</p>;
  }

  return (
    <ul className="divide-y divide-white/10">
      {devices.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3">
          <span className="text-[22px]" aria-hidden="true">📱</span>
          <div className="flex-1">
            <p className="text-[15px] text-white">{d.name ?? d.type ?? 'Device'}</p>
            {d.lastSeen && (
              <p className="text-[13px] text-white/50">
                Last seen {new Date(d.lastSeen).toLocaleDateString()}
              </p>
            )}
          </div>
          <span
            className={`flex items-center gap-1.5 text-[13px] ${d.isOnline ? 'text-[#30D158]' : 'text-white/40'}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${d.isOnline ? 'bg-[#30D158]' : 'bg-white/30'}`}
              aria-hidden="true"
            />
            {d.isOnline ? 'Online' : 'Offline'}
          </span>
        </li>
      ))}
    </ul>
  );
}
