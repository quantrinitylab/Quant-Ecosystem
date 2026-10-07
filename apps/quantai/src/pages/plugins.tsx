// ============================================================================
// QuantAI - Plugin Marketplace
// Plugins come from the real backend (GET /api/plugins); install/uninstall go
// to POST /api/plugins/[id]/install|uninstall. Only fields the backend returns
// are shown - no fabricated install counts, ratings, or usage charts.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface Plugin {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  fullDescription?: string;
  author?: string;
  category?: string;
  version?: string;
  isInstalled?: boolean;
  isEnabled?: boolean;
  apiKeyRequired?: boolean;
  apiKey?: string;
  triggers?: string[];
}

const CATEGORIES = ['all', 'productivity', 'development', 'creative', 'automation'];

export default function PluginsPage(): JSX.Element {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');

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
        const res = await fetch('/api/plugins');
        const data = (await res.json().catch(() => ({}))) as {
          plugins?: Plugin[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Could not load plugins');
        }
        const list = Array.isArray(data) ? (data as unknown as Plugin[]) : (data.plugins ?? []);
        if (!cancelled) setPlugins(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load plugins');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const installedPlugins = useMemo(() => plugins.filter((p) => p.isInstalled), [plugins]);

  const filteredPlugins = useMemo(() => {
    let result = plugins.filter((p) => !p.isInstalled);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.author || '').toLowerCase().includes(q),
      );
    }
    if (category !== 'all') {
      result = result.filter((p) => p.category === category);
    }
    return result;
  }, [plugins, searchQuery, category]);

  const selectedPluginData = useMemo(() => {
    if (!selectedPlugin) return null;
    return plugins.find((p) => p.id === selectedPlugin) || null;
  }, [selectedPlugin, plugins]);

  const runPluginAction = useCallback(
    async (pluginId: string, verb: 'install' | 'uninstall') => {
      setActionLoading(pluginId);
      setActionError(null);
      try {
        const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/${verb}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || `Could not ${verb} plugin`);
        }
        setPlugins((prev) =>
          prev.map((p) =>
            p.id === pluginId
              ? { ...p, isInstalled: verb === 'install', isEnabled: verb === 'install' ? true : false }
              : p,
          ),
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `Could not ${verb} plugin`);
      } finally {
        setActionLoading(null);
      }
    },
    [],
  );

  const handleInstall = useCallback(
    (pluginId: string) => void runPluginAction(pluginId, 'install'),
    [runPluginAction],
  );

  const handleUninstall = useCallback(
    (pluginId: string) => void runPluginAction(pluginId, 'uninstall'),
    [runPluginAction],
  );

  const handleToggleEnabled = useCallback((pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === pluginId ? { ...p, isEnabled: !p.isEnabled } : p)),
    );
  }, []);

  const handleApiKeyChange = useCallback((pluginId: string, key: string) => {
    setPlugins((prev) => prev.map((p) => (p.id === pluginId ? { ...p, apiKey: key } : p)));
  }, []);

  if (error) {
    return (
      <div className="plugins-page error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="plugins-page">
      <header className="plugins-header">
        <h1>Plugin Marketplace</h1>
      </header>

      {actionError && (
        <div className="action-error">
          <p>{actionError}</p>
          <button onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      {isLoading ? (
        <div className="loading-plugins">
          <p>Loading plugins...</p>
        </div>
      ) : (
        <>
          {installedPlugins.length > 0 && (
            <section className="installed-section">
              <h2>Installed ({installedPlugins.length})</h2>
              <div className="installed-grid">
                {installedPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className={`plugin-card installed ${plugin.isEnabled ? 'enabled' : 'disabled'}`}
                  >
                    <div className="card-header">
                      <span className="plugin-icon">{plugin.icon || '🔌'}</span>
                      <div className="plugin-info">
                        <h3>{plugin.name}</h3>
                        {plugin.version && <span className="plugin-version">v{plugin.version}</span>}
                      </div>
                      <label className="enable-toggle">
                        <input
                          type="checkbox"
                          checked={!!plugin.isEnabled}
                          onChange={() => handleToggleEnabled(plugin.id)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    {plugin.description && <p className="plugin-desc">{plugin.description}</p>}
                    {plugin.apiKeyRequired && (
                      <div className="api-key-section">
                        <input
                          type="password"
                          value={plugin.apiKey || ''}
                          onChange={(e) => handleApiKeyChange(plugin.id, e.target.value)}
                          placeholder="Enter API Key"
                          className="api-key-input"
                        />
                      </div>
                    )}
                    <div className="card-actions">
                      <button className="btn-configure" onClick={() => setSelectedPlugin(plugin.id)}>
                        Configure
                      </button>
                      <button
                        className="btn-uninstall"
                        onClick={() => handleUninstall(plugin.id)}
                        disabled={actionLoading === plugin.id}
                      >
                        {actionLoading === plugin.id ? 'Working...' : 'Uninstall'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="browse-section">
            <div className="browse-header">
              <h2>Browse Plugins</h2>
              <div className="filter-bar">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search plugins..."
                  className="search-input"
                />
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="browse-grid">
              {filteredPlugins.length === 0 ? (
                <div className="empty-plugins">
                  <p>No plugins found matching your criteria</p>
                </div>
              ) : (
                filteredPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="plugin-card"
                    onClick={() => setSelectedPlugin(plugin.id)}
                  >
                    <div className="card-header">
                      <span className="plugin-icon">{plugin.icon || '🔌'}</span>
                      <div className="plugin-info">
                        <h3>{plugin.name}</h3>
                        {plugin.author && (
                          <span className="plugin-author">by {plugin.author}</span>
                        )}
                      </div>
                    </div>
                    {plugin.description && <p className="plugin-desc">{plugin.description}</p>}
                    <button
                      className="btn-install"
                      disabled={actionLoading === plugin.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(plugin.id);
                      }}
                    >
                      {actionLoading === plugin.id ? 'Installing...' : 'Install'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {selectedPluginData && (
        <div className="plugin-detail-overlay">
          <div className="plugin-detail-panel">
            <div className="detail-header">
              <span className="detail-icon">{selectedPluginData.icon || '🔌'}</span>
              <div className="detail-title">
                <h2>{selectedPluginData.name}</h2>
                <span className="detail-author">
                  {selectedPluginData.author ? `by ${selectedPluginData.author}` : ''}
                  {selectedPluginData.version ? ` | v${selectedPluginData.version}` : ''}
                </span>
              </div>
              <button className="btn-close" onClick={() => setSelectedPlugin(null)}>
                x
              </button>
            </div>
            <div className="detail-body">
              {(selectedPluginData.fullDescription || selectedPluginData.description) && (
                <p className="detail-full-desc">
                  {selectedPluginData.fullDescription || selectedPluginData.description}
                </p>
              )}
              {selectedPluginData.category && (
                <div className="detail-stats">
                  <span>{selectedPluginData.category}</span>
                </div>
              )}
              {(selectedPluginData.triggers || []).length > 0 && (
                <div className="detail-triggers">
                  <h4>Triggers</h4>
                  <div className="trigger-tags">
                    {(selectedPluginData.triggers || []).map((t, i) => (
                      <span key={i} className="trigger-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedPluginData.apiKeyRequired && (
                <div className="detail-api-key">
                  <h4>API Key Required</h4>
                  <input
                    type="password"
                    value={selectedPluginData.apiKey || ''}
                    onChange={(e) => handleApiKeyChange(selectedPluginData.id, e.target.value)}
                    placeholder="Enter your API key"
                    className="api-key-input"
                  />
                </div>
              )}
              <div className="detail-actions">
                {selectedPluginData.isInstalled ? (
                  <button
                    className="btn-uninstall"
                    onClick={() => handleUninstall(selectedPluginData.id)}
                    disabled={actionLoading === selectedPluginData.id}
                  >
                    {actionLoading === selectedPluginData.id ? 'Working...' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    className="btn-install"
                    onClick={() => handleInstall(selectedPluginData.id)}
                    disabled={actionLoading === selectedPluginData.id}
                  >
                    {actionLoading === selectedPluginData.id ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
