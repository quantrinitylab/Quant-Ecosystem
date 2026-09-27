import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QUANT_SOVEREIGN_APPS } from './constants/apps';
import { TitleBar } from './components/TitleBar';
import { Dock } from './components/Dock';
import { AppFrame } from './components/AppFrame';
import { CommandPalette } from './components/CommandPalette';
import { KpiMetricCard, BentoFeatureGrid, FaqAccordion } from './components/bento';
import { vfsService } from './services/vfs-bridge';
import { toggleMaximizeDesktopWindow } from './services/tauri';
import type {
  AppId,
  DesktopTab,
  CommandItem,
  AudioRoomStageInfo,
  BentoItem,
  FaqItem,
} from './types';
import './styles.css';

export interface AppProps {
  initialTab?: DesktopTab;
  initialAudioStage?: AudioRoomStageInfo;
  initialGiftCoins?: number;
}

export const App: React.FC<AppProps> = ({
  initialTab,
  initialAudioStage,
  initialGiftCoins = 1250,
}) => {
  const [activeTab, setActiveTab] = useState<DesktopTab>(initialTab ?? 'overview');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [audioStage] = useState<AudioRoomStageInfo>(
    initialAudioStage || {
      id: 'stage-main',
      title: 'Quant Sovereign Architecture Stage',
      topic: 'FastCDC 64KB CAS & Tripartite Swarm',
      hostName: 'Subagent C1',
      speakersCount: 4,
      listenersCount: 42,
      isLive: true,
      activeSpeaker: 'Subagent C1',
      tags: ['desktop', 'vfs', 'bento'],
    },
  );
  const [giftCoins] = useState<number>(initialGiftCoins);

  const isDashboard = activeTab === 'dashboard' || activeTab === 'overview';

  const activeApp = useMemo(() => {
    const appId = isDashboard ? 'quantmail' : activeTab;
    return QUANT_SOVEREIGN_APPS.find((app) => app.id === appId) || QUANT_SOVEREIGN_APPS[0];
  }, [activeTab, isDashboard]);

  const selectApp = useCallback((appId: AppId) => {
    setActiveTab(appId);
  }, []);

  const selectTab = useCallback((tab: DesktopTab) => {
    setActiveTab(tab);
  }, []);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K, Alt+0 for Dashboard, Alt+1..6 for Apps)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for Unified Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Alt+0 for Dashboard Overview
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === '0') {
        e.preventDefault();
        selectTab('dashboard');
        return;
      }

      // Alt+1 .. Alt+6 for quick app switching
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= QUANT_SOVEREIGN_APPS.length) {
          e.preventDefault();
          selectApp(QUANT_SOVEREIGN_APPS[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectApp, selectTab]);

  // Bento Feature Grid Items
  const bentoGridItems: BentoItem[] = useMemo(
    () => [
      {
        id: 'vfs-cas',
        title: 'FastCDC-64KB Gear CAS Storage',
        description:
          'Zero-byte virtual projection via Windows ProjFS (G:\\) with on-demand chunk hydration and 4.8x deduplication.',
        span: '2x1',
        badge: 'QuantDrive',
        icon: '📁',
        onClick: () => selectApp('quantdrive'),
      },
      {
        id: 'double-ratchet',
        title: 'Double Ratchet E2EE',
        description:
          'Pre-key bundle Curve25519 verification with 410 Gone ephemeral self-destructing media.',
        span: '1x1',
        badge: 'QuantChat',
        icon: '💬',
        onClick: () => selectApp('quantchat'),
      },
      {
        id: 'git-smart-http',
        title: 'Git Smart HTTP & 3-Way Merge',
        description:
          'Sovereign repository daemon with status merge gates and in-browser code editor.',
        span: '1x1',
        badge: 'CodeHub',
        icon: '🐙',
        onClick: () => selectApp('codehub'),
      },
      {
        id: 'tripartite-swarm',
        title: 'Tripartite 15-Agent Swarm OS',
        description:
          'Autonomous multi-node orchestration across Node A (IDE), Node B (Peer), and Node C (Dev CLI).',
        span: '2x1',
        badge: 'QuantAI',
        icon: '🧠',
        onClick: () => selectApp('quantai'),
      },
      {
        id: 'adaptive-media',
        title: '4K HLS Segmented Adaptive Media',
        description: 'Zero-tracking public video streaming pipeline and global audio player dock.',
        span: '1x1',
        badge: 'QuanTube',
        icon: '▶️',
        onClick: () => selectApp('quantube'),
      },
      {
        id: 'sovereign-mail',
        title: 'RFC 5322 MIME & Undo-Send Mailbox',
        description:
          'Sub-5ms SQLite FTS5 search indexer with Superhuman split inboxes and 10s recall countdown.',
        span: '1x1',
        badge: 'QuantMail',
        icon: '✉️',
        onClick: () => selectApp('quantmail'),
      },
    ],
    [selectApp],
  );

  // FAQ Items
  const faqItems: FaqItem[] = useMemo(
    () => [
      {
        id: 'faq-vfs',
        question: 'How does the sovereign FastCDC 64KB CAS virtual drive work on Desktop?',
        answer:
          'Quant Desktop mounts a virtual file system at G:\\ using Windows Projected File System (ProjFS). Files use FastCDC 64KB variable-size chunking and Gear hashing, allowing instant zero-byte cloud hydration without consuming local drive space.',
        category: 'Storage',
      },
      {
        id: 'faq-audio-stage',
        question: 'What is the Live Audio Stage and how do speakers participate?',
        answer:
          'The Live Audio Stage leverages real-time Mediasoup SFU WebRTC streams. Up to 10 speakers can broadcast concurrently while listeners tune in with sub-100ms latency and interactive emoji reactions.',
        category: 'Audio Stage',
      },
      {
        id: 'faq-gifts',
        question: 'How do Virtual Gifts and Coin balances function in the desktop shell?',
        answer:
          'Virtual gifts allow desktop users to reward creators in live streams and social rooms. The quick badge displays your live coin balance (1,250 Coins default), which syncs with the Shortie creator economy across Web, Android, and Desktop.',
        category: 'Economy',
      },
      {
        id: 'faq-offline',
        question: 'Can I run all 6 sovereign applications completely offline?',
        answer:
          'Yes! Quant Desktop packages local SQLite, cached VFS chunks, and sovereign daemons, allowing complete local-first productivity even when completely disconnected from the cloud.',
        category: 'Architecture',
      },
    ],
    [],
  );

  // Unified Command Palette Items
  const commands: CommandItem[] = useMemo(() => {
    const dashboardCmd: CommandItem = {
      id: 'app-switch-dashboard',
      title: 'Switch to Ecosystem Overview & Nexsas Bento Dashboard',
      subtitle: 'Nexsas Bento KPI cards, Live Audio Stage, and FAQ accordion',
      category: 'Apps',
      shortcut: 'Alt+0',
      icon: '📊',
      keywords: ['dashboard', 'overview', 'bento', 'nexsas', 'metrics', 'kpi'],
      action: () => selectTab('dashboard'),
    };

    const appCommands: CommandItem[] = QUANT_SOVEREIGN_APPS.map((app, index) => ({
      id: `app-switch-${app.id}`,
      title: `Switch to ${app.name}`,
      subtitle: app.tagline,
      category: 'Apps',
      shortcut: `Alt+${index + 1}`,
      icon: app.icon,
      keywords: [app.id, app.name, 'switch', 'open', 'launch'],
      action: () => selectApp(app.id),
    }));

    const audioStageCmd: CommandItem = {
      id: 'audio-room-stage',
      title: 'Chatter Live Audio Room Stage',
      subtitle: '🎙️ Live Audio Stage: 4 Speakers | 42 Listeners',
      category: 'Audio Room',
      icon: '🎙️',
      keywords: ['audio', 'stage', 'room', 'speakers', 'listeners'],
      action: () => selectTab('dashboard'),
    };

    const giftsCmd: CommandItem = {
      id: 'gifts-balance',
      title: 'Virtual Gifts Coin Balance',
      subtitle: '🎁 Gifts: 1,250 Coins available',
      category: 'Gifts',
      icon: '🎁',
      keywords: ['gifts', 'coins', 'shortie', 'virtual', 'balance'],
      action: () => selectTab('dashboard'),
    };

    const vfsCommands: CommandItem[] = [
      {
        id: 'vfs-reindex',
        title: 'VFS: Trigger FastCDC 64KB CAS Re-index',
        subtitle: 'Recalculate CAS hashes and synchronize virtual drive placeholders',
        category: 'VFS Storage',
        icon: '⚡',
        keywords: ['vfs', 'fastcdc', 'sync', 'cas', 'reindex', 'gear'],
        action: () => {
          vfsService.triggerFastCdcReindex();
        },
      },
      {
        id: 'vfs-flush-l1',
        title: 'VFS: Flush L1 LRU Memory Chunk Cache',
        subtitle: 'Purge hot in-memory chunks and preserve local disk placeholders',
        category: 'VFS Storage',
        icon: '🧹',
        keywords: ['vfs', 'cache', 'flush', 'lru', 'memory', 'clean'],
        action: () => {
          vfsService.flushL1Cache();
        },
      },
      {
        id: 'vfs-mount-info',
        title: 'VFS: Inspect G:\\ ProjFS Mount Point',
        subtitle: 'Windows Projected File System virtual drive status and hydrated states',
        category: 'VFS Storage',
        icon: '📁',
        keywords: ['vfs', 'mount', 'projfs', 'windows', 'g:', 'drive'],
        action: () => {
          selectApp('quantdrive');
        },
      },
    ];

    const windowCommands: CommandItem[] = [
      {
        id: 'window-toggle-max',
        title: 'Toggle Window Maximize',
        subtitle: 'Expand or restore desktop workspace bounds',
        category: 'Window',
        shortcut: 'F11',
        icon: '▢',
        keywords: ['maximize', 'fullscreen', 'window', 'resize'],
        action: () => {
          toggleMaximizeDesktopWindow();
        },
      },
    ];

    return [
      dashboardCmd,
      ...appCommands,
      audioStageCmd,
      giftsCmd,
      ...vfsCommands,
      ...windowCommands,
    ];
  }, [selectApp, selectTab]);

  return (
    <div className="desktop-shell-root" data-testid="desktop-shell-root">
      {/* 1. Desktop Window Titlebar & Window Controls with Live Stage Badges */}
      <TitleBar
        activeApp={activeApp}
        audioStage={audioStage}
        giftCoins={giftCoins}
        activeTab={activeTab}
        onSelectTab={selectTab}
        onToggleDashboard={() =>
          setActiveTab((prev) =>
            prev === 'dashboard' || prev === 'overview' ? activeApp.id : 'overview',
          )
        }
        onOpenAudioStage={() => setActiveTab('overview')}
        onOpenGifts={() => setActiveTab('overview')}
      />

      {/* 2. Embedded Active App Frame Viewport or Nexsas Bento Dashboard */}
      <div className="desktop-content-area" data-testid="desktop-content-area">
        {isDashboard ? (
          <div className="desktop-dashboard-container" data-testid="ecosystem-dashboard">
            {/* Dashboard Hero Banner */}
            <div className="dashboard-hero-banner" data-testid="dashboard-hero-banner">
              <div className="dashboard-hero-left">
                <span className="dashboard-hero-icon">📊</span>
                <div>
                  <h1 className="dashboard-hero-title">Quant Sovereign Ecosystem Overview</h1>
                  <p className="dashboard-hero-sub">
                    Nexsas Bento architecture, real-time node telemetry, and sovereign local-first
                    cloud
                  </p>
                </div>
              </div>

              <div className="dashboard-hero-badges">
                <div className="audio-stage-badge" data-testid="dashboard-audio-stage-badge">
                  <span className="audio-stage-pulse">●</span>
                  <span>
                    {`🎙️ Live Audio Stage: ${audioStage.speakersCount} Speakers | ${audioStage.listenersCount} Listeners`}
                  </span>
                </div>
                <div className="virtual-gift-badge" data-testid="dashboard-virtual-gift-badge">
                  <span>{`🎁 Gifts: ${giftCoins.toLocaleString()} Coins`}</span>
                </div>
              </div>
            </div>

            {/* Nexsas Bento KPI Metric Cards */}
            <div className="bento-kpi-grid" data-testid="kpi-metric-cards-grid">
              <KpiMetricCard
                title="Ecosystem Revenue"
                value="$24,850"
                change={18.4}
                timePeriod="vs last 30 days"
                sparklineData={[18200, 19400, 20800, 22500, 23900, 24850]}
                trend="up"
                icon={<span>💳</span>}
              />
              <KpiMetricCard
                title="Active Nodes"
                value="1.4M Active Nodes"
                change={12.8}
                timePeriod="across 142 regions"
                sparklineData={[980000, 1050000, 1180000, 1260000, 1340000, 1400000]}
                trend="up"
                icon={<span>🌐</span>}
              />
              <KpiMetricCard
                title="Node Reliability"
                value="99.99% Uptime"
                change={0.05}
                timePeriod="last 90 days SLA"
                sparklineData={[99.95, 99.96, 99.98, 99.99, 99.98, 99.99]}
                trend="up"
                icon={<span>🛡️</span>}
              />
              <KpiMetricCard
                title="Storage Optimization"
                value="64KB CAS Deduplication"
                change={8.5}
                changeLabel="4.8x Dedup"
                timePeriod="FastCDC-64KB Gear CAS"
                sparklineData={[3.2, 3.6, 4.0, 4.2, 4.6, 4.8]}
                trend="up"
                icon={<span>📦</span>}
              />
            </div>

            {/* Nexsas Bento Feature Grid */}
            <div className="dashboard-section" data-testid="bento-section">
              <div className="dashboard-section-header">
                <h2 className="dashboard-section-title">Sovereign Architecture Bento</h2>
                <p className="dashboard-section-sub">
                  Zero-mock modular engines running natively on desktop
                </p>
              </div>
              <BentoFeatureGrid items={bentoGridItems} />
            </div>

            {/* Animated FAQ Accordion */}
            <div className="dashboard-section" data-testid="faq-section">
              <FaqAccordion
                items={faqItems}
                title="Frequently Asked Questions"
                subtitle="Everything you need to know about the sovereign desktop shell, VFS, and live stages."
                allowMultipleOpen={false}
              />
            </div>
          </div>
        ) : (
          <AppFrame app={activeApp} />
        )}
      </div>

      {/* 3. Frosted Glass Multi-App Switcher Dock */}
      <Dock
        apps={QUANT_SOVEREIGN_APPS}
        activeAppId={activeTab}
        onSelectApp={selectApp}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onSelectDashboard={() => setActiveTab('overview')}
      />

      {/* 4. Global Cmd+K / Ctrl+K Unified Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
};
