'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiClient,
  type AdminOrganization,
  type AdminMailDomain,
  type AdminMailDomainRegistration,
  type AdminMailDomainVerification,
} from '../services/api-client';

/**
 * K9 (M19 Admin Domains) data hook.
 *
 * Loads the staff-visible organizations (for the org picker), then the mail
 * domains for the selected org. Every row on screen comes from
 * `GET /admin/mail/domains` — the hook exposes honest loading/empty/error
 * states and never invents a domain.
 *
 * Mutations (`register` / `verify` / `remove`) re-fetch the list on success
 * so the table always reflects the backend. All are staff-gated server-side
 * (401/403) and org-scoped (400 when the scope is missing).
 */

export type AdminFetchState = 'loading' | 'ready' | 'error';

export function useAdminOrganizations() {
  const [organizations, setOrganizations] = useState<AdminOrganization[] | null>(null);
  const [state, setState] = useState<AdminFetchState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);
    void apiClient.getAdminOrganizations().then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        setOrganizations(r.data.organizations);
        setState('ready');
      } else {
        setState('error');
        setError(r.error?.message ?? 'Failed to load organizations.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    organizations,
    state,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}

export function useAdminMailDomains(organizationId: string | null) {
  const [domains, setDomains] = useState<AdminMailDomain[] | null>(null);
  const [state, setState] = useState<AdminFetchState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId) {
      setDomains(null);
      setState('loading');
      return;
    }
    let cancelled = false;
    setState('loading');
    setError(null);
    void apiClient.listAdminMailDomains(organizationId).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        setDomains(r.data.domains);
        setState('ready');
      } else {
        setState('error');
        setError(r.error?.message ?? 'Failed to load domains.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, nonce]);

  const register = useCallback(
    async (domain: string): Promise<{ ok: boolean; message: string; registration?: AdminMailDomainRegistration }> => {
      if (!organizationId) return { ok: false, message: 'Select an organization first.' };
      const r = await apiClient.registerAdminMailDomain(organizationId, domain);
      if (r.success && r.data) {
        refresh();
        return { ok: true, message: '', registration: r.data };
      }
      return { ok: false, message: r.error?.message ?? 'Failed to register domain.' };
    },
    [organizationId, refresh],
  );

  const verify = useCallback(
    async (domainId: string): Promise<{ ok: boolean; message: string; result?: AdminMailDomainVerification }> => {
      if (!organizationId) return { ok: false, message: 'Select an organization first.' };
      const r = await apiClient.verifyAdminMailDomain(domainId, organizationId);
      if (r.success && r.data) {
        refresh();
        return { ok: true, message: '', result: r.data };
      }
      return { ok: false, message: r.error?.message ?? 'DNS verification failed.' };
    },
    [organizationId, refresh],
  );

  const remove = useCallback(
    async (domainId: string): Promise<{ ok: boolean; message: string }> => {
      if (!organizationId) return { ok: false, message: 'Select an organization first.' };
      const r = await apiClient.deleteAdminMailDomain(domainId, organizationId);
      if (r.success) {
        refresh();
        return { ok: true, message: '' };
      }
      return { ok: false, message: r.error?.message ?? 'Failed to remove domain.' };
    },
    [organizationId, refresh],
  );

  return { domains, state, error, refresh, register, verify, remove };
}
