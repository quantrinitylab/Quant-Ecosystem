// ============================================================================
// QuantAI - Ecosystem Control Center
// 8 app tiles with settings/status, unified search, notification center,
// app-to-app quick actions, per-app usage analytics
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface EcosystemApp {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: 'active' | 'inactive' | 'maintenance';
  isEnabled: boolean;
  version: string;
  usageToday: number;
  usageWeek: number;
  usageMonth: number;
  lastActive: string;
  color: string;
}

interface Notification {
  id: string;
  appId: string;
  appName: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: 'info' | 'warning' | 'error' | 'success';
}

interface QuickAction {
  id: string;
  sourceApp: string;
  targetApp: string;
  label: string;
  icon: string;
}

interface AnalyticsData {
  appId: string;
  daily: number[];
  weekly: number[];
  totalRequests: number;
  avgResponseTime: number;
  errorRate: number;
}

const INITIAL_APPS: EcosystemApp[] = [
  { id: 'quantchat', name: 'QuantChat', icon: '💬', description: 'Instant messaging with disappearing messages', status: 'active', isEnabled: true, version: '3.2.1', usageToday: 2450, usageWeek: 15230, usageMonth: 58900, lastActive: '2024-01-15T14:30:00Z', color: '#f59e0b' },
  { id: 'quantmail', name: 'QuantMail', icon: '📧', description: 'Email, Git, CI/CD, and collaboration', status: 'active', isEnabled: true, version: '2.8.0', usageToday: 1890, usageWeek: 12100, usageMonth: 45600, lastActive: '2024-01-15T14:25:00Z', color: '#3b82f6' },
  { id: 'quantsync', name: 'QuantSync', icon: '🔄', description: 'Social microblogging and communities', status: 'active', isEnabled: true, version: '4.1.0', usageToday: 3200, usageWeek: 21000, usageMonth: 82000, lastActive: '2024-01-15T14:28:00Z', color: '#10b981' },
  { id: 'quantads', name: 'QuantAds', icon: '📢', description: 'Advertising platform with RTB engine', status: 'active', isEnabled: true, version: '1.5.2', usageToday: 890, usageWeek: 5600, usageMonth: 21000, lastActive: '2024-01-15T12:00:00Z', color: '#ef4444' },
  { id: 'quantube', name: 'QuantTube', icon: '📺', description: 'Video, music, and live streaming', status: 'active', isEnabled: true, version: '5.0.0', usageToday: 4100, usageWeek: 28500, usageMonth: 110000, lastActive: '2024-01-15T14:30:00Z', color: '#8b5cf6' },
  { id: 'quantneon', name: 'QuantNeon', icon: '📸', description: 'Photos, reels, stories, and shopping', status: 'active', isEnabled: true, version: '3.7.1', usageToday: 3800, usageWeek: 25600, usageMonth: 98000, lastActive: '2024-01-15T14:29:00Z', color: '#ec4899' },
  { id: 'quantedits', name: 'QuantEdits', icon: '🎬', description: 'Video and design editor with AI tools', status: 'active', isEnabled: true, version: '2.3.0', usageToday: 560, usageWeek: 3400, usageMonth: 12800, lastActive: '2024-01-15T13:45:00Z', color: '#06b6d4' },
  { id: 'quantmax', name: 'QuantMax', icon: '🚀', description: 'Short video, dating, and video chat', status: 'active', isEnabled: true, version: '1.9.5', usageToday: 5200, usageWeek: 34000, usageMonth: 135000, lastActive: '2024-01-15T14:30:00Z', color: '#f97316' },
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 'n1', appId: 'quantchat', appName: 'QuantChat', title: 'New message', message: 'You have 5 unread messages from 3 contacts', timestamp: '2024-01-15T14:28:00Z', isRead: false, type: 'info' },
  { id: 'n2', appId: 'quantmail', appName: 'QuantMail', title: 'Build failed', message: 'CI pipeline for project-alpha failed at test stage', timestamp: '2024-01-15T14:20:00Z', isRead: false, type: 'error' },
  { id: 'n3', appId: 'quantsync', appName: 'QuantSync', title: 'Trending post', message: 'Your post reached 10K views', timestamp: '2024-01-15T13:45:00Z', isRead: true, type: 'success' },
  { id: 'n4', appId: 'quantube', appName: 'QuantTube', title: 'Upload complete', message: 'Video transcoding finished in all qualities', timestamp: '2024-01-15T12:30:00Z', isRead: true, type: 'success' },
  { id: 'n5', appId: 'quantads', appName: 'QuantAds', title: 'Budget alert', message: 'Campaign "Summer Sale" reached 80% budget', timestamp: '2024-01-15T11:00:00Z', isRead: false, type: 'warning' },
  { id: 'n6', appId: 'quantneon', appName: 'QuantNeon', title: 'New follower', message: '15 new followers today', timestamp: '2024-01-15T10:30:00Z', isRead: true, type: 'info' },
];

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa1', sourceApp: 'quantchat', targetApp: 'quantmail', label: 'Share to Email', icon: '📧' },
  { id: 'qa2', sourceApp: 'quantneon', targetApp: 'quantsync', label: 'Cross-post', icon: '🔄' },
  { id: 'qa3', sourceApp: 'quantedits', targetApp: 'quantube', label: 'Upload to Tube', icon: '📺' },
  { id: 'qa4', sourceApp: 'quantedits', targetApp: 'quantneon', label: 'Post to Neon', icon: '📸' },
  { id: 'qa5', sourceApp: 'quantube', targetApp: 'quantmax', label: 'Create Short', icon: '🚀' },
  { id: 'qa6', sourceApp: 'quantads', targetApp: 'quantneon', label: 'Promote Post', icon: '📢' },
];

const ANALYTICS_DATA: AnalyticsData[] = [
  { appId: 'quantchat', daily: [120, 145, 132, 168, 155, 190, 178], weekly: [890, 1020, 950, 1100], totalRequests: 58900, avgResponseTime: 45, errorRate: 0.2 },
  { appId: 'quantmail', daily: [90, 110, 95, 125, 108, 140, 130], weekly: [720, 810, 780, 890], totalRequests: 45600, avgResponseTime: 120, errorRate: 0.5 },
  { appId: 'quantsync', daily: [200, 230, 190, 260, 245, 310, 280], weekly: [1450, 1620, 1520, 1780], totalRequests: 82000, avgResponseTime: 35, errorRate: 0.1 },
  { appId: 'quantads', daily: [50, 65, 55, 72, 60, 80, 75], weekly: [380, 440, 410, 490], totalRequests: 21000, avgResponseTime: 200, errorRate: 1.2 },
  { appId: 'quantube', daily: [250, 290, 270, 320, 300, 380, 350], weekly: [1800, 2100, 1950, 2300], totalRequests: 110000, avgResponseTime: 80, errorRate: 0.3 },
  { appId: 'quantneon', daily: [220, 260, 240, 300, 280, 350, 320], weekly: [1650, 1900, 1780, 2100], totalRequests: 98000, avgResponseTime: 55, errorRate: 0.2 },
  { appId: 'quantedits', daily: [30, 40, 35, 48, 42, 55, 50], weekly: [250, 290, 270, 320], totalRequests: 12800, avgResponseTime: 350, errorRate: 0.8 },
  { appId: 'quantmax', daily: [300, 350, 320, 400, 380, 450, 420], weekly: [2200, 2500, 2350, 2800], totalRequests: 135000, avgResponseTime: 40, errorRate: 0.15 },
];

export default function EcosystemPage(): JSX.Element {
  const [apps, setApps] = useState<EcosystemApp[]>(INITIAL_APPS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [analytics] = useState<AnalyticsData[]>(ANALYTICS_DATA);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length;
  }, [notifications]);

  const filteredApps = useMemo(() => {
    if (!searchQuery) return apps;
    const q = searchQuery.toLowerCase();
    return apps.filter(
      app => app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)
    );
  }, [apps, searchQuery]);

  const selectedAppData = useMemo(() => {
    if (!selectedApp) return null;
    return apps.find(a => a.id === selectedApp) || null;
  }, [selectedApp, apps]);

  const selectedAppAnalytics = useMemo(() => {
    if (!selectedApp) return null;
    return analytics.find(a => a.appId === selectedApp) || null;
  }, [selectedApp, analytics]);

  const handleToggleApp = useCallback((appId: string) => {
    setApps(prev => prev.map(a =>
      a.id === appId ? { ...a, isEnabled: !a.isEnabled, status: a.isEnabled ? 'inactive' : 'active' } : a
    ));
  }, []);

  const handleMarkRead = useCallback((notifId: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === notifId ? { ...n, isRead: true } : n
    ));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const handleClearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleAppClick = useCallback((appId: string) => {
    setSelectedApp(appId === selectedApp ? null : appId);
  }, [selectedApp]);

  const renderMiniChart = useCallback((data: number[]) => {
    const max = Math.max(...data);
    return (
      <div className="mini-chart">
        {data.map((value, i) => (
          <div
            key={i}
            className="chart-bar"
            style={{ height: `${(value / max) * 100}%` }}
          />
        ))}
      </div>
    );
  }, []);

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
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search across all apps..."
              className="ecosystem-search-input"
            />
          </div>
          <button
            className="btn-quick-actions"
            onClick={() => setShowQuickActions(!showQuickActions)}
          >
            ⚡ Quick Actions
          </button>
          <button
            className={`btn-notifications ${unreadCount > 0 ? 'has-unread' : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            🔔 {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
        </div>
      </header>

      {showNotifications && (
        <div className="notification-panel">
          <div className="panel-header">
            <h3>Notifications</h3>
            <div className="panel-actions">
              <button onClick={handleMarkAllRead}>Mark all read</button>
              <button onClick={handleClearNotifications}>Clear all</button>
              <button onClick={() => setShowNotifications(false)}>x</button>
            </div>
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="empty-notifs">No notifications</p>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`notification-item ${notif.type} ${notif.isRead ? 'read' : 'unread'}`}
                  onClick={() => handleMarkRead(notif.id)}
                >
                  <div className="notif-icon">
                    {notif.type === 'info' && 'ℹ️'}
                    {notif.type === 'warning' && '⚠️'}
                    {notif.type === 'error' && '❌'}
                    {notif.type === 'success' && '✅'}
                  </div>
                  <div className="notif-content">
                    <div className="notif-header">
                      <span className="notif-app">{notif.appName}</span>
                      <span className="notif-time">{new Date(notif.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="notif-title">{notif.title}</div>
                    <div className="notif-message">{notif.message}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showQuickActions && (
        <div className="quick-actions-panel">
          <div className="panel-header">
            <h3>Quick Actions</h3>
            <button onClick={() => setShowQuickActions(false)}>x</button>
          </div>
          <div className="quick-actions-list">
            {QUICK_ACTIONS.map(action => (
              <button key={action.id} className="quick-action-btn">
                <span className="qa-icon">{action.icon}</span>
                <span className="qa-label">{action.label}</span>
                <span className="qa-apps">{action.sourceApp} → {action.targetApp}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ecosystem-body">
        <section className="apps-grid">
          {filteredApps.length === 0 ? (
            <div className="empty-search">
              <p>No apps match your search</p>
            </div>
          ) : (
            filteredApps.map(app => {
              const appAnalytics = analytics.find(a => a.appId === app.id);
              return (
                <div
                  key={app.id}
                  className={`app-tile ${app.status} ${selectedApp === app.id ? 'selected' : ''}`}
                  onClick={() => handleAppClick(app.id)}
                  style={{ borderColor: app.color }}
                >
                  <div className="tile-header">
                    <span className="app-icon">{app.icon}</span>
                    <div className="app-status-indicator">
                      <span className={`status-dot ${app.status}`} />
                    </div>
                    <label className="settings-toggle" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={app.isEnabled}
                        onChange={() => handleToggleApp(app.id)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div className="tile-body">
                    <h3 className="app-name">{app.name}</h3>
                    <p className="app-description">{app.description}</p>
                    <div className="app-meta">
                      <span className="app-version">v{app.version}</span>
                      <span className="app-usage">{app.usageToday.toLocaleString()} today</span>
                    </div>
                  </div>
                  {appAnalytics && (
                    <div className="tile-chart">
                      {renderMiniChart(appAnalytics.daily)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>

        {selectedAppData && selectedAppAnalytics && (
          <aside className="app-detail-panel">
            <div className="detail-header">
              <span className="detail-icon">{selectedAppData.icon}</span>
              <h2>{selectedAppData.name}</h2>
              <button className="btn-close" onClick={() => setSelectedApp(null)}>x</button>
            </div>
            <div className="detail-body">
              <div className="detail-stats">
                <div className="stat-card">
                  <span className="stat-label">Total Requests</span>
                  <span className="stat-value">{selectedAppAnalytics.totalRequests.toLocaleString()}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Avg Response</span>
                  <span className="stat-value">{selectedAppAnalytics.avgResponseTime}ms</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Error Rate</span>
                  <span className="stat-value">{selectedAppAnalytics.errorRate}%</span>
                </div>
              </div>
              <div className="detail-chart">
                <h4>Weekly Usage</h4>
                <div className="bar-chart">
                  {selectedAppAnalytics.weekly.map((val, i) => (
                    <div key={i} className="bar-wrapper">
                      <div className="bar" style={{ height: `${(val / Math.max(...selectedAppAnalytics.weekly)) * 100}%`, background: selectedAppData.color }} />
                      <span className="bar-label">W{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail-info">
                <p><strong>Version:</strong> {selectedAppData.version}</p>
                <p><strong>Status:</strong> {selectedAppData.status}</p>
                <p><strong>Last Active:</strong> {new Date(selectedAppData.lastActive).toLocaleString()}</p>
                <p><strong>Monthly Usage:</strong> {selectedAppData.usageMonth.toLocaleString()}</p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
