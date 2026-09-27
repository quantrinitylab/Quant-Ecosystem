import React from 'react';
import type { QuantAppDefinition, AppId, DesktopTab } from '../types';

interface DockProps {
  apps: QuantAppDefinition[];
  activeAppId: AppId | DesktopTab;
  onSelectApp: (appId: AppId) => void;
  onOpenCommandPalette: () => void;
  onSelectDashboard?: () => void;
}

export function Dock({
  apps,
  activeAppId,
  onSelectApp,
  onOpenCommandPalette,
  onSelectDashboard,
}: DockProps): React.ReactElement {
  return (
    <div className="desktop-dock-container">
      <nav className="desktop-dock" aria-label="Sovereign App Dock">
        {apps.map((app, index) => {
          const isActive = app.id === activeAppId;
          return (
            <button
              key={app.id}
              className={`dock-item ${isActive ? 'dock-item-active' : ''}`}
              onClick={() => onSelectApp(app.id)}
              style={
                isActive
                  ? ({ '--dock-accent-glow': `${app.accentColor}66` } as React.CSSProperties)
                  : undefined
              }
              aria-label={`Switch to ${app.name}`}
              data-appid={app.id}
            >
              <span className="dock-item-icon">{app.icon}</span>
              {isActive && (
                <span className="dock-active-dot" style={{ backgroundColor: app.accentColor }} />
              )}
              <span className="dock-tooltip">
                {app.name} <span style={{ opacity: 0.6, fontSize: '10px' }}>({index + 1})</span>
              </span>
            </button>
          );
        })}

        {onSelectDashboard && (
          <button
            className={`dock-item ${activeAppId === 'dashboard' || activeAppId === 'overview' ? 'dock-item-active' : ''}`}
            onClick={onSelectDashboard}
            style={
              activeAppId === 'dashboard' || activeAppId === 'overview'
                ? ({ '--dock-accent-glow': 'rgba(56, 189, 248, 0.4)' } as React.CSSProperties)
                : undefined
            }
            aria-label="Switch to Ecosystem Overview & Nexsas Bento Dashboard"
            data-testid="dock-item-dashboard"
          >
            <span className="dock-item-icon">📊</span>
            {(activeAppId === 'dashboard' || activeAppId === 'overview') && (
              <span className="dock-active-dot" style={{ backgroundColor: '#38bdf8' }} />
            )}
            <span className="dock-tooltip">
              Overview <span style={{ opacity: 0.6, fontSize: '10px' }}>(Bento)</span>
            </span>
          </button>
        )}

        <div className="dock-separator" />

        <button
          className="dock-cmd-button"
          onClick={onOpenCommandPalette}
          title="Open Unified Command Palette (Cmd+K / Ctrl+K)"
          aria-label="Open Command Palette"
        >
          <span>⌘K</span>
        </button>
      </nav>
    </div>
  );
}
