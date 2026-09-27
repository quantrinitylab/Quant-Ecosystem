import React from 'react';
import { VfsSyncBadge } from './VfsSyncBadge';
import {
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
} from '../services/tauri';
import type { QuantAppDefinition, AudioRoomStageInfo, DesktopTab } from '../types';

interface TitleBarProps {
  activeApp: QuantAppDefinition;
  audioStage?: AudioRoomStageInfo;
  giftCoins?: number;
  activeTab?: DesktopTab;
  onSelectTab?: (tab: DesktopTab) => void;
  onToggleDashboard?: () => void;
  onOpenAudioStage?: () => void;
  onOpenGifts?: () => void;
}

export function TitleBar({
  activeApp,
  audioStage,
  giftCoins = 1250,
  activeTab,
  onToggleDashboard,
  onOpenAudioStage,
  onOpenGifts,
}: TitleBarProps): React.ReactElement {
  const isDashboard = activeTab === 'dashboard' || activeTab === 'overview';
  const speakers = audioStage?.speakersCount ?? 4;
  const listeners = audioStage?.listenersCount ?? 42;
  const formattedCoins = giftCoins.toLocaleString();

  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="titlebar-drag-region" data-tauri-drag-region>
        <div className="titlebar-brand">
          <span className="brand-glyph">Q</span>
          <span>Quant Desktop</span>
        </div>

        {isDashboard ? (
          <div className="active-app-breadcrumb" data-testid="breadcrumb-dashboard">
            <span>📊</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>Ecosystem Overview</span>
            <span style={{ color: 'var(--text-subtle)', fontSize: '10px' }}>(Nexsas Bento)</span>
          </div>
        ) : (
          <div className="active-app-breadcrumb" data-testid="breadcrumb-app">
            <span>{activeApp.icon}</span>
            <span style={{ fontWeight: 600, color: activeApp.accentColor }}>{activeApp.name}</span>
            <span style={{ color: 'var(--text-subtle)', fontSize: '10px' }}>
              ({activeApp.badge})
            </span>
          </div>
        )}

        {onToggleDashboard && (
          <button
            type="button"
            className={`titlebar-dashboard-btn ${isDashboard ? 'active' : ''}`}
            onClick={onToggleDashboard}
            title={isDashboard ? 'Return to Active App' : 'Open Ecosystem Overview & Nexsas Bento'}
            data-testid="toggle-dashboard-btn"
          >
            {isDashboard ? '🖥️ View App' : '📊 Overview'}
          </button>
        )}
      </div>

      <div className="titlebar-center">
        <VfsSyncBadge />

        <div className="titlebar-quick-status" data-testid="titlebar-quick-status">
          <button
            type="button"
            className="audio-stage-badge"
            data-testid="audio-stage-badge"
            title="Chatter Live Audio Room Stage"
            onClick={onOpenAudioStage}
          >
            <span className="audio-stage-pulse">●</span>
            <span>{`🎙️ Live Audio Stage: ${speakers} Speakers | ${listeners} Listeners`}</span>
          </button>

          <button
            type="button"
            className="virtual-gift-badge"
            data-testid="virtual-gift-badge"
            title="Shortie Creator Virtual Gifts Balance"
            onClick={onOpenGifts}
          >
            <span>{`🎁 Gifts: ${formattedCoins} Coins`}</span>
          </button>
        </div>
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
