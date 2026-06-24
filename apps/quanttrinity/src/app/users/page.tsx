'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import type { OversightUser } from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  DEACTIVATED: 'default',
  PENDING_VERIFICATION: 'warning',
};

export default function UsersPage() {
  const [users, setUsers] = useState<OversightUser[]>([]);
  const [dbConnected, setDbConnected] = useState(true);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await ownerFetch<{ data: OversightUser[]; dbConnected: boolean }>(
        `/api/users${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      );
      setUsers(res.data);
      setDbConnected(res.dbConnected);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const setStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await ownerFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">User Oversight</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Search, monitor and act on any user across the entire ecosystem (one QuantMail identity =
          all apps).
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
      >
        <input
          className="flex-1 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm text-[var(--quant-foreground)]"
          placeholder="Search by email, username or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>

      {!dbConnected && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">
            Database offline — no users to show. The oversight surface is wired and will populate
            once the DB is connected.
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--quant-muted-foreground)]">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--quant-muted-foreground)]">No users found.</p>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-[var(--quant-border)]">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--quant-foreground)]">
                      {u.displayName}
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">
                      @{u.username}
                    </span>
                    <Badge variant={STATUS_BADGE[u.status] ?? 'default'} size="sm">
                      {u.status}
                    </Badge>
                    <Badge variant="info" size="sm">
                      {u.role}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                    {u.email} · L{u.level} ·{' '}
                    {u.lastLoginAt
                      ? `last login ${new Date(u.lastLoginAt).toLocaleDateString()}`
                      : 'never logged in'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {u.status !== 'SUSPENDED' ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(u.id, 'SUSPENDED')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="success" onClick={() => setStatus(u.id, 'ACTIVE')}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
