'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';
import { formatCount, formatPercent } from '../lib/admin-kpi-format';
import { formatBytes } from '../lib/format-bytes';

/**
 * Fetches the four QuantMail admin KPI cards from the per-app admin API and
 * exposes each as a display-ready cell. Each card resolves independently, so a
 * slow or failing metric never blocks the others.
 *
 * On any non-success (403 non-staff, network error, backend not yet deployed)
 * a cell falls to `error` and the console keeps its honest "unavailable" state
 * rather than inventing a number — mirrors the backend's read-only contract in
 * `backend/routes/admin.ts`.
 */

export type KpiState = 'loading' | 'ready' | 'error';

export interface KpiCell {
  value: string | null;
  state: KpiState;
}

export interface AdminKpis {
  accounts: KpiCell;
  sessions: KpiCell;
  storage: KpiCell;
  delivery: KpiCell;
  /** Re-run every request (e.g. a manual refresh control). */
  refresh: () => void;
}

const PENDING: KpiCell = { value: null, state: 'loading' };
const FAILED: KpiCell = { value: null, state: 'error' };

export function useAdminKpis(): AdminKpis {
  const [accounts, setAccounts] = useState<KpiCell>(PENDING);
  const [sessions, setSessions] = useState<KpiCell>(PENDING);
  const [storage, setStorage] = useState<KpiCell>(PENDING);
  const [delivery, setDelivery] = useState<KpiCell>(PENDING);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ready = (value: string): KpiCell => ({ value, state: 'ready' });

    setAccounts(PENDING);
    setSessions(PENDING);
    setStorage(PENDING);
    setDelivery(PENDING);

    void apiClient.getAdminAccountsCount().then((r) => {
      if (!cancelled) setAccounts(r.success && r.data ? ready(formatCount(r.data.total)) : FAILED);
    });
    void apiClient.getAdminActiveSessions().then((r) => {
      if (!cancelled) setSessions(r.success && r.data ? ready(formatCount(r.data.active)) : FAILED);
    });
    void apiClient.getAdminStorageSummary().then((r) => {
      if (!cancelled)
        setStorage(r.success && r.data ? ready(formatBytes(r.data.usedBytes)) : FAILED);
    });
    void apiClient.getAdminDeliverability().then((r) => {
      if (!cancelled)
        setDelivery(r.success && r.data ? ready(formatPercent(r.data.successRate)) : FAILED);
    });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { accounts, sessions, storage, delivery, refresh: () => setNonce((n) => n + 1) };
}
