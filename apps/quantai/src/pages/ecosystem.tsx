// ============================================================================
// QuantAI - Ecosystem Control Center
// Apps come from the real backend (GET /api/ecosystem/apps); AI toggles go to
// POST /api/ecosystem/apps/[appId]/toggle-ai. No fabricated usage stats,
// notifications, or quick actions.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface EcosystemApp {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  isEnabled?: boolean;
  version?: string;
  color?: string;
  lastActive?: string;
}

export default function EcosystemPage(): JSX.Element {
  const [apps, setApps] = useState<EcosystemApp[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/ecosystem/apps');
        const data = (await res.json().catch(() => ({}))) as {
          apps?: EcosystemApp[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Could not load ecosystem apps');
        }
        const list = Array.isArray(data) ? (data as unknown as EcosystemApp[]) : (data.apps ?? []);
        if (!cancelled) setApps(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load ecosystem apps');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredApps = useMemo(() => {
    if (!searchQuery) return apps;
    const q = searchQuery.toLowerCase();
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) || (app.description || '').toLowerCase().includes(q),
    );
  }, [apps, searchQuery]);

  const selectedAppData = useMemo(() => {
    if (!selectedApp) return null;
    return apps.find((a) => a.id === selectedApp) || null;
  }, [selectedApp, apps]);

  const handleToggleApp = useCallback(async (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    const next = !app.isEnabled;
    setActionLoading(appId);
    setActionError(null);
    try {
      const res = await fetch(`/api/ecosystem/apps/${encodeURIComponent(appId)}/toggle-ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Could not toggle app');
      }
      setApps((prev) =>
        prev.map((a) =>
          a.id === appId
            ? { ...a, isEnabled: next, status: next ? 'active' : 'inactive' }
            : a,
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not toggle app');
    } finally {
      setActionLoading(null);
    }
  }, [apps]);

  const handleAppClick = useCallback(
    (appId: string) => {
      setSelectedApp(appId === selectedApp ? null : appId);
    },
    [selectedApp],
  );

  if (error) {
    return (
      <div className="ecosystem-page error-state">
        <h2>Error Loading Ecosystem</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="ecosystem-page">
      <header className="ecosystem-header">
        <h1>Ecosystem Control Center</h1>
        <div className="header-controls">
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all apps..."
              className="ecosystem-search-input"
            />
          </div>
        </div>
      </header>

      {actionError && (
        <div className="action-error">
          <p>{actionError}</p>
          <button onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      <div className="ecosystem-body">
        {isLoading ? (
          <div className="loading-apps">
            <p>Loading apps...</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="empty-search">
            <p>{searchQuery ? 'No apps match your search' : 'No apps connected yet.'}</p>
          </div>
        ) : (
          <section className="apps-grid">
            {filteredApps.map((app) => (
              <div
                key={app.id}
                className={`app-tile ${app.status || ''} ${selectedApp === app.id ? 'selected' : ''}`}
                onClick={() => handleAppClick(app.id)}
                style={app.color ? { borderColor: app.color } : undefined}
              >
                <div className="tile-header">
                  <span className="app-icon">{app.icon || '📱'}</span>
                  <div className="app-status-indicator">
                    <span className={`status-dot ${app.status || 'inactive'}`} />
                  </div>
                  <label className="settings-toggle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!app.isEnabled}
                      disabled={actionLoading === app.id}
                      onChange={() => handleToggleApp(app.id)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="tile-body">
                  <h3 className="app-name">{app.name}</h3>
                  {app.description && <p className="app-description">{app.description}</p>}
                  <div className="app-meta">
                    {app.version && <span className="app-version">v{app.version}</span>}
                    {app.status && <span className="app-status-text">{app.status}</span>}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {selectedAppData && (
          <aside className="app-detail-panel">
            <div className="detail-header">
              <span className="detail-icon">{selectedAppData.icon || '📱'}</span>
              <h2>{selectedAppData.name}</h2>
              <button className="btn-close" onClick={() => setSelectedApp(null)}>
                x
              </button>
            </div>
            <div className="detail-body">
              <div className="detail-info">
                {selectedAppData.description && <p>{selectedAppData.description}</p>}
                {selectedAppData.version && (
                  <p>
                    <strong>Version:</strong> {selectedAppData.version}
                  </p>
                )}
                {selectedAppData.status && (
                  <p>
                    <strong>Status:</strong> {selectedAppData.status}
                  </p>
                )}
                {selectedAppData.lastActive && (
                  <p>
                    <strong>Last Active:</strong>{' '}
                    {new Date(selectedAppData.lastActive).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
