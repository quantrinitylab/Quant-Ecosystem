import React from 'react';
import { VfsSyncBadge } from './VfsSyncBadge';
import {
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
} from '../services/tauri';
import type { QuantAppDefinition } from '../types';

interface TitleBarProps {
  activeApp: QuantAppDefinition;
}

export function TitleBar({ activeApp }: TitleBarProps): React.ReactElement {
  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="titlebar-drag-region" data-tauri-drag-region>
        <div className="titlebar-brand">
          <span className="brand-glyph">Q</span>
          <span>Quant Desktop</span>
        </div>

        <div className="active-app-breadcrumb">
          <span>{activeApp.icon}</span>
          <span style={{ fontWeight: 600, color: activeApp.accentColor }}>{activeApp.name}</span>
          <span style={{ color: 'var(--text-subtle)', fontSize: '10px' }}>({activeApp.badge})</span>
        </div>
      </div>

      <div className="titlebar-center">
        <VfsSyncBadge />
      </div>

      <div className="window-controls">
        <button
          className="win-btn win-btn-min"
          onClick={() => minimizeDesktopWindow()}
          title="Minimize"
          aria-label="Minimize Window"
        >
          —
        </button>
        <button
          className="win-btn win-btn-max"
          onClick={() => toggleMaximizeDesktopWindow()}
          title="Maximize / Restore"
          aria-label="Maximize Window"
        >
          ▢
        </button>
        <button
          className="win-btn win-btn-close"
          onClick={() => closeDesktopWindow()}
          title="Close"
          aria-label="Close Window"
        >
          ✕
        </button>
      </div>
    </header>
  );
}
