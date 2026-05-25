// ============================================================================
// QuantAI - Plugin Marketplace
// Browse grid, search/filter, installed plugins section, plugin detail panel,
// enabled/disabled toggle, "Create Custom Plugin" form, usage analytics
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface Plugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  fullDescription: string;
  author: string;
  installCount: number;
  rating: number;
  category: string;
  version: string;
  isInstalled: boolean;
  isEnabled: boolean;
  apiKeyRequired: boolean;
  apiKey?: string;
  screenshots: string[];
  triggers: string[];
  usageStats: {
    calls: number[];
    errors: number[];
  };
}

interface PluginFilter {
  category: string;
  sortBy: 'popular' | 'rating' | 'newest';
}

const INITIAL_PLUGINS: Plugin[] = [
  {
    id: 'pl1', name: 'Web Search', icon: '🔍', description: 'Search the web in real-time',
    fullDescription: 'Enable QuantAI to search the web for current information, news, and data. Supports multiple search engines and returns structured results.',
    author: 'QuantAI Team', installCount: 45200, rating: 4.8, category: 'productivity', version: '2.1.0',
    isInstalled: true, isEnabled: true, apiKeyRequired: false, screenshots: ['/plugins/web-search-1.png'],
    triggers: ['search', 'find', 'lookup'], usageStats: { calls: [120, 145, 132, 168, 155, 190, 178], errors: [2, 1, 3, 0, 1, 2, 1] }
  },
  {
    id: 'pl2', name: 'Code Interpreter', icon: '💻', description: 'Execute code in a sandbox',
    fullDescription: 'Run Python, JavaScript, and other code in a secure sandbox environment. Supports data analysis, visualization, and file manipulation.',
    author: 'QuantAI Team', installCount: 38900, rating: 4.7, category: 'development', version: '3.0.1',
    isInstalled: true, isEnabled: true, apiKeyRequired: false, screenshots: ['/plugins/code-interpreter-1.png'],
    triggers: ['run code', 'execute', 'calculate'], usageStats: { calls: [90, 110, 95, 125, 108, 140, 130], errors: [5, 3, 4, 2, 3, 1, 2] }
  },
  {
    id: 'pl3', name: 'DALL-E Image Gen', icon: '🎨', description: 'Generate images from text prompts',
    fullDescription: 'Create stunning images using AI. Supports multiple styles, aspect ratios, and editing capabilities including inpainting and outpainting.',
    author: 'QuantAI Team', installCount: 52100, rating: 4.9, category: 'creative', version: '1.5.0',
    isInstalled: true, isEnabled: false, apiKeyRequired: true, apiKey: 'sk-***',
    screenshots: ['/plugins/dalle-1.png', '/plugins/dalle-2.png'],
    triggers: ['generate image', 'create picture', 'draw'], usageStats: { calls: [50, 65, 55, 72, 60, 80, 75], errors: [1, 0, 2, 1, 0, 1, 0] }
  },
  {
    id: 'pl4', name: 'Wolfram Alpha', icon: '🧮', description: 'Advanced math and data',
    fullDescription: 'Access Wolfram Alpha for complex computations, mathematical analysis, unit conversions, and scientific data lookups.',
    author: 'Wolfram Research', installCount: 21300, rating: 4.5, category: 'productivity', version: '1.2.0',
    isInstalled: false, isEnabled: false, apiKeyRequired: true, screenshots: ['/plugins/wolfram-1.png'],
    triggers: ['calculate', 'math', 'solve'], usageStats: { calls: [30, 40, 35, 48, 42, 55, 50], errors: [0, 1, 0, 0, 1, 0, 0] }
  },
  {
    id: 'pl5', name: 'Notion Sync', icon: '📝', description: 'Sync with Notion workspace',
    fullDescription: 'Read and write to your Notion workspace. Create pages, update databases, query content, and sync notes bidirectionally.',
    author: 'Community', installCount: 18700, rating: 4.3, category: 'productivity', version: '1.8.2',
    isInstalled: false, isEnabled: false, apiKeyRequired: true, screenshots: ['/plugins/notion-1.png'],
    triggers: ['note', 'save to notion', 'create page'], usageStats: { calls: [20, 25, 22, 30, 28, 35, 32], errors: [1, 0, 1, 2, 0, 1, 0] }
  },
  {
    id: 'pl6', name: 'GitHub Assistant', icon: '🐙', description: 'Manage GitHub repos and PRs',
    fullDescription: 'Interact with GitHub repositories. Create issues, review PRs, search code, manage workflows, and automate repository tasks.',
    author: 'Community', installCount: 28400, rating: 4.6, category: 'development', version: '2.3.1',
    isInstalled: false, isEnabled: false, apiKeyRequired: true, screenshots: ['/plugins/github-1.png'],
    triggers: ['github', 'pull request', 'issue'], usageStats: { calls: [60, 75, 68, 82, 78, 95, 88], errors: [3, 2, 4, 1, 2, 3, 1] }
  },
  {
    id: 'pl7', name: 'Zapier Connect', icon: '⚡', description: 'Connect to 5000+ apps via Zapier',
    fullDescription: 'Trigger Zapier workflows from QuantAI. Connect to Slack, Google Sheets, Salesforce, and thousands of other services.',
    author: 'Zapier Inc', installCount: 15600, rating: 4.4, category: 'automation', version: '1.1.0',
    isInstalled: false, isEnabled: false, apiKeyRequired: true, screenshots: ['/plugins/zapier-1.png'],
    triggers: ['automate', 'trigger', 'zap'], usageStats: { calls: [15, 20, 18, 25, 22, 28, 25], errors: [0, 1, 0, 0, 1, 0, 0] }
  },
  {
    id: 'pl8', name: 'Voice Transcription', icon: '🎤', description: 'Transcribe audio files and meetings',
    fullDescription: 'Transcribe audio and video files with high accuracy. Supports 50+ languages, speaker diarization, and timestamp generation.',
    author: 'QuantAI Team', installCount: 22800, rating: 4.6, category: 'productivity', version: '2.0.0',
    isInstalled: false, isEnabled: false, apiKeyRequired: false, screenshots: ['/plugins/transcription-1.png'],
    triggers: ['transcribe', 'audio', 'meeting notes'], usageStats: { calls: [40, 50, 45, 55, 52, 65, 60], errors: [2, 1, 2, 1, 0, 1, 1] }
  },
];

const CATEGORIES = ['all', 'productivity', 'development', 'creative', 'automation'];

export default function PluginsPage(): JSX.Element {
  const [plugins, setPlugins] = useState<Plugin[]>(INITIAL_PLUGINS);
  const [installedPlugins, setInstalledPlugins] = useState<Plugin[]>(INITIAL_PLUGINS.filter(p => p.isInstalled));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [filter, setFilter] = useState<PluginFilter>({ category: 'all', sortBy: 'popular' });

  const [customName, setCustomName] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [customWebhook, setCustomWebhook] = useState<string>('');
  const [customTriggers, setCustomTriggers] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const filteredPlugins = useMemo(() => {
    let result = plugins.filter(p => !p.isInstalled);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q)
      );
    }
    if (filter.category !== 'all') {
      result = result.filter(p => p.category === filter.category);
    }
    switch (filter.sortBy) {
      case 'popular': result.sort((a, b) => b.installCount - a.installCount); break;
      case 'rating': result.sort((a, b) => b.rating - a.rating); break;
      case 'newest': result.sort((a, b) => b.version.localeCompare(a.version)); break;
    }
    return result;
  }, [plugins, searchQuery, filter]);

  const selectedPluginData = useMemo(() => {
    if (!selectedPlugin) return null;
    return plugins.find(p => p.id === selectedPlugin) || null;
  }, [selectedPlugin, plugins]);

  const handleInstall = useCallback((pluginId: string) => {
    setPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, isInstalled: true, isEnabled: true } : p
    ));
    const plugin = plugins.find(p => p.id === pluginId);
    if (plugin) setInstalledPlugins(prev => [...prev, { ...plugin, isInstalled: true, isEnabled: true }]);
  }, [plugins]);

  const handleUninstall = useCallback((pluginId: string) => {
    setPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, isInstalled: false, isEnabled: false } : p
    ));
    setInstalledPlugins(prev => prev.filter(p => p.id !== pluginId));
  }, []);

  const handleToggleEnabled = useCallback((pluginId: string) => {
    setPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, isEnabled: !p.isEnabled } : p
    ));
    setInstalledPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, isEnabled: !p.isEnabled } : p
    ));
  }, []);

  const handleApiKeyChange = useCallback((pluginId: string, key: string) => {
    setPlugins(prev => prev.map(p =>
      p.id === pluginId ? { ...p, apiKey: key } : p
    ));
  }, []);

  const handleCreatePlugin = useCallback(() => {
    if (!customName.trim() || !customWebhook.trim()) return;
    const newPlugin: Plugin = {
      id: `pl-custom-${Date.now()}`,
      name: customName,
      icon: '🔧',
      description: customDescription || 'Custom plugin',
      fullDescription: customDescription,
      author: 'You',
      installCount: 0,
      rating: 0,
      category: 'automation',
      version: '1.0.0',
      isInstalled: true,
      isEnabled: true,
      apiKeyRequired: false,
      screenshots: [],
      triggers: customTriggers.split(',').map(t => t.trim()).filter(Boolean),
      usageStats: { calls: [0, 0, 0, 0, 0, 0, 0], errors: [0, 0, 0, 0, 0, 0, 0] },
    };
    setPlugins(prev => [...prev, newPlugin]);
    setInstalledPlugins(prev => [...prev, newPlugin]);
    setShowCreateForm(false);
    setCustomName('');
    setCustomDescription('');
    setCustomWebhook('');
    setCustomTriggers('');
  }, [customName, customDescription, customWebhook, customTriggers]);

  const renderUsageChart = useCallback((calls: number[], errors: number[]) => {
    const max = Math.max(...calls, 1);
    return (
      <div className="usage-chart">
        <div className="chart-bars">
          {calls.map((val, i) => (
            <div key={i} className="chart-bar-group">
              <div className="bar-calls" style={{ height: `${(val / max) * 100}%` }} title={`${val} calls`} />
              {errors[i] > 0 && (
                <div className="bar-errors" style={{ height: `${(errors[i] / max) * 100}%` }} title={`${errors[i]} errors`} />
              )}
            </div>
          ))}
        </div>
        <div className="chart-labels">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
            <span key={i}>{day}</span>
          ))}
        </div>
      </div>
    );
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
        <button className="btn-create-plugin" onClick={() => setShowCreateForm(!showCreateForm)}>
          + Create Custom Plugin
        </button>
      </header>

      {showCreateForm && (
        <section className="create-form">
          <h2>Create Custom Plugin</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Plugin Name</label>
              <input type="text" value={customName} onChange={e => setCustomName(e.target.value)} placeholder="My Plugin" className="form-input" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" value={customDescription} onChange={e => setCustomDescription(e.target.value)} placeholder="What does it do?" className="form-input" />
            </div>
            <div className="form-group">
              <label>Webhook URL</label>
              <input type="url" value={customWebhook} onChange={e => setCustomWebhook(e.target.value)} placeholder="https://your-api.com/webhook" className="form-input" />
            </div>
            <div className="form-group">
              <label>Triggers (comma separated)</label>
              <input type="text" value={customTriggers} onChange={e => setCustomTriggers(e.target.value)} placeholder="trigger1, trigger2" className="form-input" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-save" onClick={handleCreatePlugin} disabled={!customName.trim() || !customWebhook.trim()}>Create Plugin</button>
            <button className="btn-cancel" onClick={() => setShowCreateForm(false)}>Cancel</button>
          </div>
        </section>
      )}

      {installedPlugins.length > 0 && (
        <section className="installed-section">
          <h2>Installed ({installedPlugins.length})</h2>
          <div className="installed-grid">
            {installedPlugins.map(plugin => (
              <div key={plugin.id} className={`plugin-card installed ${plugin.isEnabled ? 'enabled' : 'disabled'}`}>
                <div className="card-header">
                  <span className="plugin-icon">{plugin.icon}</span>
                  <div className="plugin-info">
                    <h3>{plugin.name}</h3>
                    <span className="plugin-version">v{plugin.version}</span>
                  </div>
                  <label className="enable-toggle">
                    <input type="checkbox" checked={plugin.isEnabled} onChange={() => handleToggleEnabled(plugin.id)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <p className="plugin-desc">{plugin.description}</p>
                {plugin.apiKeyRequired && (
                  <div className="api-key-section">
                    <input
                      type="password"
                      value={plugin.apiKey || ''}
                      onChange={e => handleApiKeyChange(plugin.id, e.target.value)}
                      placeholder="Enter API Key"
                      className="api-key-input"
                    />
                  </div>
                )}
                {renderUsageChart(plugin.usageStats.calls, plugin.usageStats.errors)}
                <div className="card-actions">
                  <button className="btn-configure" onClick={() => setSelectedPlugin(plugin.id)}>Configure</button>
                  <button className="btn-uninstall" onClick={() => handleUninstall(plugin.id)}>Uninstall</button>
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
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="search-input"
            />
            <select value={filter.category} onChange={e => setFilter(prev => ({ ...prev, category: e.target.value }))}>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
              ))}
            </select>
            <select value={filter.sortBy} onChange={e => setFilter(prev => ({ ...prev, sortBy: e.target.value as any }))}>
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
        <div className="browse-grid">
          {filteredPlugins.length === 0 ? (
            <div className="empty-plugins"><p>No plugins found matching your criteria</p></div>
          ) : (
            filteredPlugins.map(plugin => (
              <div key={plugin.id} className="plugin-card" onClick={() => setSelectedPlugin(plugin.id)}>
                <div className="card-header">
                  <span className="plugin-icon">{plugin.icon}</span>
                  <div className="plugin-info">
                    <h3>{plugin.name}</h3>
                    <span className="plugin-author">by {plugin.author}</span>
                  </div>
                </div>
                <p className="plugin-desc">{plugin.description}</p>
                <div className="plugin-stats">
                  <span className="install-count">{plugin.installCount.toLocaleString()} installs</span>
                  <span className="rating">{'★'.repeat(Math.round(plugin.rating))} {plugin.rating}</span>
                </div>
                <button className="btn-install" onClick={e => { e.stopPropagation(); handleInstall(plugin.id); }}>
                  Install
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {selectedPluginData && (
        <div className="plugin-detail-overlay">
          <div className="plugin-detail-panel">
            <div className="detail-header">
              <span className="detail-icon">{selectedPluginData.icon}</span>
              <div className="detail-title">
                <h2>{selectedPluginData.name}</h2>
                <span className="detail-author">by {selectedPluginData.author} | v{selectedPluginData.version}</span>
              </div>
              <button className="btn-close" onClick={() => setSelectedPlugin(null)}>x</button>
            </div>
            <div className="detail-body">
              <p className="detail-full-desc">{selectedPluginData.fullDescription}</p>
              <div className="detail-stats">
                <span>{selectedPluginData.installCount.toLocaleString()} installs</span>
                <span>{'★'.repeat(Math.round(selectedPluginData.rating))} ({selectedPluginData.rating})</span>
                <span>{selectedPluginData.category}</span>
              </div>
              {selectedPluginData.triggers.length > 0 && (
                <div className="detail-triggers">
                  <h4>Triggers</h4>
                  <div className="trigger-tags">
                    {selectedPluginData.triggers.map((t, i) => (
                      <span key={i} className="trigger-tag">{t}</span>
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
                    onChange={e => handleApiKeyChange(selectedPluginData.id, e.target.value)}
                    placeholder="Enter your API key"
                    className="api-key-input"
                  />
                </div>
              )}
              <div className="detail-actions">
                {selectedPluginData.isInstalled ? (
                  <button className="btn-uninstall" onClick={() => handleUninstall(selectedPluginData.id)}>Uninstall</button>
                ) : (
                  <button className="btn-install" onClick={() => handleInstall(selectedPluginData.id)}>Install</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
