import React from 'react';
import type { QuantAppDefinition, AppId } from '../types';

interface DockProps {
  apps: QuantAppDefinition[];
  activeAppId: AppId;
  onSelectApp: (appId: AppId) => void;
  onOpenCommandPalette: () => void;
}

export function Dock({
  apps,
  activeAppId,
  onSelectApp,
  onOpenCommandPalette,
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
