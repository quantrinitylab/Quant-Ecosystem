// ============================================================================
// Quanty Connectors — consumer screen (Muse screenshot #1 parity).
// 'use client': fetches catalog + connections, sections, search, detail sheet.
// ============================================================================

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CONSUMER_CONNECTOR_CATALOG,
  getConsumerConnector,
  type ConsumerConnector,
  type McpConnection,
} from '../../lib/connectors/catalog';
import { ConnectorRow, type RowAction } from './ConnectorRow';
import { ConnectorDetailSheet, type FetchImpl } from './ConnectorDetailSheet';
import { ConnectorsSearch } from './ConnectorsSearch';

interface ConnectorsScreenProps {
  /** Injectable fetch for tests. Defaults to window.fetch. */
  fetchImpl?: FetchImpl;
  /** Back navigation handler (defaults to history.back). */
  onBack?: () => void;
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function errorMessage(payload: any, fallback: string): string {
  const msg = payload?.error?.message || payload?.message;
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback;
}

export function ConnectorsScreen({ fetchImpl, onBack }: ConnectorsScreenProps) {
  const doFetch: FetchImpl = fetchImpl ?? ((...args) => fetch(...args));
  const [catalog, setCatalog] = useState<ConsumerConnector[]>(CONSUMER_CONNECTOR_CATALOG);
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [backendReady, setBackendReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const refreshConnections = useCallback(async () => {
    try {
      const res = await doFetch('/api/quanty/mcp/connections');
      const data = await readJson(res);
      if (res.ok && Array.isArray(data.connections)) {
        setConnections(data.connections);
        setBackendReady(!!data.backendReady);
      }
    } catch {
      // Keep last-known connections; the screen still renders the catalog.
    }
  }, [doFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [catRes] = await Promise.all([
          doFetch('/api/quanty/mcp/catalog').catch(() => null),
        ]);
        if (!cancelled && catRes && catRes.ok) {
          const data = await readJson(catRes);
          if (Array.isArray(data.providers) && data.providers.length > 0) {
            // Merge server catalog with local metadata (scopes/tools stay local).
            const byId = new Map<string, Record<string, unknown>>(
              data.providers.map((p: any) => [String(p.id), p as Record<string, unknown>]),
            );
            setCatalog(
              CONSUMER_CONNECTOR_CATALOG.filter((c) => byId.has(c.id)).map((c) => {
                const server = byId.get(c.id) ?? {};
                return {
                  ...c,
                  name: typeof server.name === 'string' ? server.name : c.name,
                  icon: typeof server.icon === 'string' ? server.icon : c.icon,
                  category: (server.category as ConsumerConnector['category']) ?? c.category,
                  description:
                    typeof server.description === 'string' ? server.description : c.description,
                  authType: (server.authType as ConsumerConnector['authType']) ?? c.authType,
                  ...(server.deviceSource === true ? { deviceSource: true as const } : {}),
                };
              }),
            );
          }
        }
      } catch {
        // Offline catalog fallback: the curated local list still renders.
      }
      if (!cancelled) {
        await refreshConnections();
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doFetch, refreshConnections]);

  const connectedIds = useMemo(
    () => new Set(connections.filter((c) => c.status === 'connected').map((c) => c.provider)),
    [connections],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const connectedList = filtered.filter((c) => connectedIds.has(c.id));
  const availableList = filtered.filter((c) => !connectedIds.has(c.id) && !c.deviceSource);
  const deviceList = filtered.filter((c) => !connectedIds.has(c.id) && c.deviceSource);

  const selected = selectedId ? getConsumerConnector(selectedId) ?? null : null;
  const selectedConnection = selected
    ? connections.find((c) => c.provider === selected.id)
    : undefined;

  const handleRowAction = useCallback(
    async (connector: ConsumerConnector, action: RowAction) => {
      if (action.kind === 'open') {
        setSelectedId(connector.id);
        return;
      }
      if (action.kind === 'connect') {
        // Connect goes through the detail sheet so scopes are visible first.
        setSelectedId(connector.id);
      }
    },
    [],
  );

  const handleConnect = useCallback(async () => {
    if (!selected) return;
    setConnectingId(selected.id);
    try {
      const res = await doFetch(
        `/api/quanty/mcp/connect/${encodeURIComponent(selected.id)}`,
        { method: 'POST' },
      );
      const data = await readJson(res);
      if (res.ok && data?.authorizeUrl) {
        window.location.href = data.authorizeUrl as string;
        return;
      }
      throw new Error(
        errorMessage(data, `${selected.name} is not available to connect yet — coming soon.`),
      );
    } finally {
      setConnectingId(null);
      await refreshConnections();
    }
  }, [selected, doFetch, refreshConnections]);

  const handleDisconnect = useCallback(async () => {
    if (!selected) return;
    const res = await doFetch(
      `/api/quanty/mcp/disconnect/${encodeURIComponent(selected.id)}`,
      { method: 'POST' },
    );
    const data = await readJson(res);
    if (!res.ok) {
      throw new Error(errorMessage(data, `Could not disconnect ${selected.name}.`));
    }
    await refreshConnections();
    setSelectedId(null);
  }, [selected, doFetch, refreshConnections]);

  const handleTest = useCallback(async () => {
    if (!selected) return { ok: false, message: 'No connector selected.' };
    const res = await doFetch(
      `/api/quanty/mcp/test/${encodeURIComponent(selected.id)}`,
      { method: 'POST' },
    );
    const data = await readJson(res);
    if (!res.ok) {
      return { ok: false as const, message: errorMessage(data, 'Test failed.') };
    }
    return {
      ok: !!data?.ok,
      latencyMs: typeof data?.latencyMs === 'number' ? data.latencyMs : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
    };
  }, [selected, doFetch]);

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
  }, [onBack]);

  const renderSection = (title: string, list: ConsumerConnector[], testId: string) => {
    if (list.length === 0) return null;
    return (
      <section className="mb-2" data-testid={testId}>
        <h2 className="text-[15px] text-white/50 px-6 mb-2 mt-6">{title}</h2>
        <div className="mx-4 bg-[#1c1c1e] rounded-[28px] overflow-hidden divide-y divide-white/5">
          {list.map((c) => (
            <ConnectorRow
              key={c.id}
              connector={c}
              connected={connectedIds.has(c.id)}
              connecting={connectingId === c.id}
              onAction={(a) => handleRowAction(c, a)}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white" data-testid="connectors-screen">
      {/* Header */}
      <header className="flex items-center px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="w-14 h-14 rounded-full bg-zinc-800/80 flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-[22px] font-semibold pr-14">Connectors</h1>
      </header>

      <div className="px-4 mt-2 mb-1">
        <ConnectorsSearch value={query} onChange={setQuery} />
      </div>

      {loading ? (
        <div className="px-4 mt-6 space-y-3" aria-label="Loading connectors">
          {[0, 1, 2].map((i) => (
            <div key={i} className="mx-0 bg-[#1c1c1e] rounded-[28px] h-[76px] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {loadError && (
            <p className="px-8 mt-4 text-[14px] text-amber-200/80">{loadError}</p>
          )}
          {renderSection('Connected', connectedList, 'connectors-connected')}
          {renderSection('Available', availableList, 'connectors-available')}
          {deviceList.length > 0 && (
            <section className="mb-8" data-testid="connectors-device">
              <h2 className="text-[15px] text-white/50 px-6 mb-2 mt-6">From this device</h2>
              <div className="mx-4 bg-[#1c1c1e] rounded-[28px] overflow-hidden divide-y divide-white/5">
                {deviceList.map((c) => (
                  <ConnectorRow
                    key={c.id}
                    connector={c}
                    connected={false}
                    onAction={(a) => handleRowAction(c, a)}
                  />
                ))}
              </div>
              <p className="px-8 mt-2 text-[13px] text-white/35">
                On-device connectors need a Quanty app update — they’ll appear here when ready.
              </p>
            </section>
          )}
          {filtered.length === 0 && (
            <p className="px-8 mt-10 text-center text-[15px] text-white/40">
              No connectors match “{query}”.
            </p>
          )}
        </>
      )}

      {selected && (
        <ConnectorDetailSheet
          connector={selected}
          connection={selectedConnection}
          backendReady={backendReady}
          onClose={() => setSelectedId(null)}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onTest={handleTest}
        />
      )}
    </div>
  );
}
