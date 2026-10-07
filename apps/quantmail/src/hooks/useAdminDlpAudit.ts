'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiClient,
  type AdminDlpPolicy,
  type AdminAuditLogEntry,
  type AdminAuditLogQuery,
} from '../services/api-client';
import type { AdminFetchState } from './useAdminMailDomains';

/**
 * K9 (M20 Admin DLP/Audit) data hooks.
 *
 * - `useAdminDlpPolicies(organizationId)`: the org's DLP/compliance mail
 *   policies (`EnterpriseMailComplianceRule`) — read-only list, real rows only.
 * - `useAdminAuditLogs(query)`: the staff-gated, read-only audit log viewer.
 *   Writes are server-side only (the client-writable `POST /audit-logs` was
 *   closed in K9); this hook never attempts to write.
 */

export function useAdminDlpPolicies(organizationId: string | null) {
  const [policies, setPolicies] = useState<AdminDlpPolicy[] | null>(null);
  const [state, setState] = useState<AdminFetchState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!organizationId) {
      setPolicies(null);
      setState('loading');
      return;
    }
    let cancelled = false;
    setState('loading');
    setError(null);
    void apiClient.listAdminDlpPolicies(organizationId).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        setPolicies(r.data.policies);
        setState('ready');
      } else {
        setState('error');
        setError(r.error?.message ?? 'Failed to load DLP policies.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, nonce]);

  return {
    policies,
    state,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}

export interface AuditLogPage {
  items: AdminAuditLogEntry[];
  nextCursor: string | null;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function useAdminAuditLogs(query: AdminAuditLogQuery) {
  const [page, setPage] = useState<AuditLogPage | null>(null);
  const [state, setState] = useState<AdminFetchState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);
    const parsed = JSON.parse(key) as AdminAuditLogQuery;
    void apiClient.listAdminAuditLogs(parsed).then((r) => {
      if (cancelled) return;
      if (r.success && r.data) {
        const body = r as unknown as {
          data: AdminAuditLogEntry[];
          nextCursor?: string | null;
          pagination?: AuditLogPage['pagination'];
        };
        setPage({
          items: body.data,
          nextCursor: body.nextCursor ?? null,
          pagination: body.pagination ?? {
            page: parsed.page ?? 1,
            limit: parsed.limit ?? 25,
            total: body.data.length,
            totalPages: 1,
          },
        });
        setState('ready');
      } else {
        setState('error');
        setError(r.error?.message ?? 'Failed to load audit logs.');
      }
    });
    return () => {
      cancelled = true;
    };
    // `key` is the serialized query; `nonce` forces a manual re-fetch.
  }, [key, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { page, state, error, refetch };
}
