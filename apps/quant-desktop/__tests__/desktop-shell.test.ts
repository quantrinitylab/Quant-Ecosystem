import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QUANT_SOVEREIGN_APPS } from '../src/constants/apps';
import { DesktopVfsService, vfsService } from '../src/services/vfs-bridge';
import {
  isTauriEnvironment,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
} from '../src/services/tauri';
import { TitleBar } from '../src/components/TitleBar';
import { Dock } from '../src/components/Dock';
import { VfsSyncBadge } from '../src/components/VfsSyncBadge';
import { AppFrame } from '../src/components/AppFrame';
import { CommandPalette } from '../src/components/CommandPalette';
import { App } from '../src/App';
import {
  KpiMetricCard,
  BentoFeatureGrid,
  FaqAccordion,
  filterFaqItems,
} from '../src/components/bento';
import type { CommandItem, BentoItem, FaqItem } from '../src/types';

describe('Desktop UI Shell - Sovereign Client Suite', () => {
  describe('Sovereign App Catalog', () => {
    it('contains all 6 sovereign applications with valid configuration', () => {
      const appIds = QUANT_SOVEREIGN_APPS.map((a) => a.id);
      expect(appIds).toEqual([
        'quantmail',
        'codehub',
        'quantdrive',
        'quantchat',
        'quantube',
        'quantai',
      ]);

      for (const app of QUANT_SOVEREIGN_APPS) {
        expect(app.name).toBeTruthy();
        expect(app.tagline).toBeTruthy();
        expect(app.defaultPort).toBeGreaterThan(1000);
        expect(app.route.startsWith('/')).toBe(true);
        expect(app.icon).toBeTruthy();
        expect(app.accentColor.startsWith('#')).toBe(true);
        expect(app.features.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('verifies QuantDrive has FastCDC 64KB CAS and ProjFS features', () => {
      const driveApp = QUANT_SOVEREIGN_APPS.find((a) => a.id === 'quantdrive')!;
      expect(driveApp).toBeDefined();
      expect(driveApp.features).toContain('ProjFS Windows G:\\');
      expect(driveApp.features).toContain('FastCDC 64KB Chunking');
      expect(driveApp.features).toContain('Content Addressable Storage');
    });
  });

  describe('VFS Service & Bridge Telemetry', () => {
    let service: DesktopVfsService;

    beforeEach(() => {
      service = DesktopVfsService.getInstance();
    });

    it('reports FastCDC 64KB Gear CAS telemetry and G:\\ mount point', () => {
      const telemetry = service.getTelemetry();
      expect(telemetry.mountPoint).toBe('G:\\');
      expect(telemetry.chunkAlgorithm).toBe('FastCDC-64KB Gear CAS');
      expect(telemetry.status).toBe('SYNCHRONIZED');
      expect(telemetry.statusText).toContain('VFS: Synchronized - 64KB Gear CAS');
      expect(telemetry.dedupRatio).toBeGreaterThan(1);
      expect(telemetry.virtualSizeBytes).toBeGreaterThan(0);
    });

    it('subscribes to telemetry changes and triggers re-index transition', async () => {
      const states: string[] = [];
      const unsubscribe = service.subscribe((t) => {
        states.push(t.status);
      });

      expect(states).toContain('SYNCHRONIZED');

      await service.triggerFastCdcReindex();

      expect(states).toContain('SYNCING');
      expect(service.getTelemetry().status).toBe('SYNCHRONIZED');

      unsubscribe();
    });

    it('flushes L1 LRU cache without error', () => {
      expect(() => service.flushL1Cache()).not.toThrow();
    });
  });

  describe('Desktop Tauri Platform Bridge', () => {
    it('gracefully handles non-Tauri browser environments without throwing', async () => {
      expect(isTauriEnvironment()).toBe(false);

      await expect(minimizeDesktopWindow()).resolves.toBeUndefined();
      await expect(toggleMaximizeDesktopWindow()).resolves.toBe(false);
      await expect(closeDesktopWindow()).resolves.toBeUndefined();
    });
  });

  describe('Command Palette Filtering & Execution', () => {
    it('filters commands by query and executes matching action', () => {
      let executed = false;
      const testCommands: CommandItem[] = [
        {
          id: 'switch-mail',
          title: 'Switch to QuantMail',
          category: 'Apps',
          keywords: ['email', 'mail', 'inbox'],
          action: () => {
            executed = true;
          },
        },
        {
          id: 'vfs-reindex',
          title: 'VFS: Trigger FastCDC 64KB CAS Re-index',
          category: 'VFS Storage',
          keywords: ['cas', 'fastcdc', 'sync'],
          action: () => {},
        },
      ];

      // Query "mail" should match Switch to QuantMail
      const query = 'mail';
      const filtered = testCommands.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(query) ||
          cmd.keywords?.some((k) => k.toLowerCase().includes(query)),
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('switch-mail');

      filtered[0].action();
      expect(executed).toBe(true);
    });
  });

  describe('Component Rendering via React DOM Server', () => {
    it('renders TitleBar with active app breadcrumb and controls', () => {
      const activeApp = QUANT_SOVEREIGN_APPS[0];
      const html = renderToString(React.createElement(TitleBar, { activeApp }));
      expect(html).toContain('Quant Desktop');
      expect(html).toContain(activeApp.name);
      expect(html).toContain('win-btn-min');
      expect(html).toContain('win-btn-max');
      expect(html).toContain('win-btn-close');
      expect(html).toContain('VFS: Synchronized');
    });

    it('renders Frosted Glass Multi-App Switcher Dock with all 6 apps', () => {
      const html = renderToString(
        React.createElement(Dock, {
          apps: QUANT_SOVEREIGN_APPS,
          activeAppId: 'codehub',
          onSelectApp: () => {},
          onOpenCommandPalette: () => {},
        }),
      );
      expect(html).toContain('dock-item-active');
      expect(html).toContain('CodeHub');
      expect(html).toContain('QuantMail');
      expect(html).toContain('QuantDrive');
      expect(html).toContain('QuantChat');
      expect(html).toContain('QuanTube');
      expect(html).toContain('QuantAI');
      expect(html).toContain('⌘K');
    });

    it('renders AppFrame with sovereign navigation address bar and preview cards', () => {
      const activeApp = QUANT_SOVEREIGN_APPS.find((a) => a.id === 'quantdrive')!;
      const html = renderToString(React.createElement(AppFrame, { app: activeApp }));
      expect(html).toContain('quant://quantdrive.local/drive');
      expect(html).toContain('FastCDC 64KB Gear CAS Virtual Drive');
      expect(html).toContain('G:\\ (Windows ProjFS)');
    });

    it('renders CommandPalette modal when open', () => {
      const html = renderToString(
        React.createElement(CommandPalette, {
          isOpen: true,
          onClose: () => {},
          commands: [
            {
              id: 'cmd-1',
              title: 'Switch to QuantMail',
              category: 'Apps',
              action: () => {},
            },
          ],
        }),
      );
      expect(html).toContain('command-palette-backdrop');
      expect(html).toContain('Switch to QuantMail');
      expect(html).toContain('ESC to exit');
    });

    it('renders root App shell properly without throwing', () => {
      const html = renderToString(React.createElement(App));
      expect(html).toContain('desktop-shell-root');
      expect(html).toContain('Quant Desktop');
      expect(html).toContain('VFS: Synchronized - 64KB Gear CAS');
      expect(html).toContain('desktop-dock');
    });
  });

  describe('Nexsas Bento & Commercial Feature Parity Suite', () => {
    describe('Nexsas KPI Metric Cards', () => {
      it('renders KPI metric card with title, value, positive trend pill, and SVG sparkline', () => {
        const html = renderToString(
          React.createElement(KpiMetricCard, {
            title: 'Ecosystem Revenue',
            value: '$24,850',
            change: 18.4,
            timePeriod: 'vs last 30 days',
            sparklineData: [18200, 19400, 20800, 22500, 23900, 24850],
            trend: 'up',
            icon: React.createElement('span', null, '💳'),
          }),
        );

        expect(html).toContain('Ecosystem Revenue');
        expect(html).toContain('$24,850');
        expect(html).toContain('bento-kpi-card');
        expect(html).toContain('bento-pill-positive');
        expect(html).toContain('+18.4%');
        expect(html).toContain('bento-sparkline-svg');
        expect(html).toContain('<polyline');
        expect(html).toContain('vs last 30 days');
        expect(html).toContain('💳');
      });

      it('renders KPI metric card with negative trend pill when trend is down', () => {
        const html = renderToString(
          React.createElement(KpiMetricCard, {
            title: 'Storage Latency',
            value: '42ms',
            change: -3.8,
            trend: 'down',
            sparklineData: [65, 58, 52, 48, 44, 42],
          }),
        );

        expect(html).toContain('Storage Latency');
        expect(html).toContain('42ms');
        expect(html).toContain('bento-pill-negative');
        expect(html).toContain('-3.8%');
        expect(html).toContain('bento-sparkline-svg');
      });

      it('renders all 4 ecosystem overview KPI cards ($24,850 Revenue, 1.4M Active Nodes, 99.99% Uptime, 64KB CAS Deduplication)', () => {
        const cards = [
          React.createElement(KpiMetricCard, {
            key: 'rev',
            title: 'Ecosystem Revenue',
            value: '$24,850',
            change: 18.4,
            sparklineData: [18200, 19400, 20800, 22500, 23900, 24850],
          }),
          React.createElement(KpiMetricCard, {
            key: 'nodes',
            title: 'Active Nodes',
            value: '1.4M Active Nodes',
            change: 12.8,
            sparklineData: [980000, 1050000, 1180000, 1260000, 1340000, 1400000],
          }),
          React.createElement(KpiMetricCard, {
            key: 'uptime',
            title: 'Node Reliability',
            value: '99.99% Uptime',
            change: 0.05,
            sparklineData: [99.95, 99.96, 99.98, 99.99, 99.98, 99.99],
          }),
          React.createElement(KpiMetricCard, {
            key: 'cas',
            title: 'Storage Optimization',
            value: '64KB CAS Deduplication',
            change: 8.5,
            sparklineData: [3.2, 3.6, 4.0, 4.2, 4.6, 4.8],
          }),
        ];

        const html = renderToString(React.createElement('div', null, ...cards));
        expect(html).toContain('$24,850');
        expect(html).toContain('1.4M Active Nodes');
        expect(html).toContain('99.99% Uptime');
        expect(html).toContain('64KB CAS Deduplication');
      });
    });

    describe('Nexsas BentoFeatureGrid', () => {
      it('renders grid items with spans, badges, headers, and preview content', () => {
        const items: BentoItem[] = [
          {
            id: 'vfs-cas',
            title: 'FastCDC-64KB Gear CAS Storage',
            description: 'Zero-byte virtual projection via Windows ProjFS (G:\\).',
            span: '2x1',
            badge: 'QuantDrive',
            icon: React.createElement('span', null, '📁'),
            preview: React.createElement('div', { className: 'custom-preview' }, 'ProjFS Preview'),
          },
          {
            id: 'double-ratchet',
            title: 'Double Ratchet E2EE',
            description: 'Curve25519 prekey federation.',
            span: '1x1',
            badge: 'QuantChat',
            icon: React.createElement('span', null, '💬'),
          },
        ];

        const html = renderToString(React.createElement(BentoFeatureGrid, { items }));
        expect(html).toContain('bento-feature-grid');
        expect(html).toContain('bento-item-vfs-cas');
        expect(html).toContain('bento-span-2x1');
        expect(html).toContain('FastCDC-64KB Gear CAS Storage');
        expect(html).toContain('QuantDrive');
        expect(html).toContain('ProjFS Preview');
        expect(html).toContain('bento-item-double-ratchet');
        expect(html).toContain('bento-span-1x1');
        expect(html).toContain('Double Ratchet E2EE');
        expect(html).toContain('QuantChat');
      });
    });

    describe('Nexsas FaqAccordion & Filter Heuristics', () => {
      const sampleFaqs: FaqItem[] = [
        {
          id: 'faq-1',
          question: 'How does the sovereign FastCDC 64KB CAS virtual drive work on Desktop?',
          answer: 'Quant Desktop mounts G:\\ with ProjFS and FastCDC 64KB chunking.',
          category: 'Storage',
        },
        {
          id: 'faq-2',
          question: 'What is the Live Audio Stage and how do speakers participate?',
          answer: 'The Live Audio Stage leverages Mediasoup SFU WebRTC streams.',
          category: 'Audio Stage',
        },
        {
          id: 'faq-3',
          question: 'How do Virtual Gifts and Coin balances function in the desktop shell?',
          answer: 'Virtual gifts allow rewarding creators with coin balances.',
          category: 'Economy',
        },
      ];

      it('filters FAQ items by search query matching question and answer', () => {
        const questionMatch = filterFaqItems(sampleFaqs, 'FastCDC');
        expect(questionMatch.length).toBe(1);
        expect(questionMatch[0].id).toBe('faq-1');

        const answerMatch = filterFaqItems(sampleFaqs, 'Mediasoup');
        expect(answerMatch.length).toBe(1);
        expect(answerMatch[0].id).toBe('faq-2');

        const noMatch = filterFaqItems(sampleFaqs, 'NonExistentTerm');
        expect(noMatch.length).toBe(0);
      });

      it('filters FAQ items by category pill', () => {
        const storageFaqs = filterFaqItems(sampleFaqs, '', 'Storage');
        expect(storageFaqs.length).toBe(1);
        expect(storageFaqs[0].id).toBe('faq-1');

        const allFaqs = filterFaqItems(sampleFaqs, '', 'All');
        expect(allFaqs.length).toBe(3);
      });

      it('renders FaqAccordion component with search bar, category pills, and collapsible items', () => {
        const html = renderToString(
          React.createElement(FaqAccordion, {
            items: sampleFaqs,
            title: 'Frequently Asked Questions',
            subtitle: 'Find quick answers to common questions',
          }),
        );

        expect(html).toContain('faq-accordion');
        expect(html).toContain('Frequently Asked Questions');
        expect(html).toContain('faq-search-input');
        expect(html).toContain('faq-question-btn');
        expect(html).toContain(
          'How does the sovereign FastCDC 64KB CAS virtual drive work on Desktop?',
        );
        expect(html).toContain('What is the Live Audio Stage and how do speakers participate?');
        expect(html).toContain(
          'How do Virtual Gifts and Coin balances function in the desktop shell?',
        );
        expect(html).toContain('faq-toggle-icon');
      });
    });

    describe('Live Audio Room Stage & Virtual Gift Shell Indicators', () => {
      it('verifies Live Audio Room stage indicator and Virtual Gift badge are present in TitleBar', () => {
        const activeApp = QUANT_SOVEREIGN_APPS[0];
        const html = renderToString(
          React.createElement(TitleBar, {
            activeApp,
            audioStage: {
              id: 'stage-1',
              title: 'Sovereign Architecture',
              hostName: 'Subagent C1',
              speakersCount: 4,
              listenersCount: 42,
              isLive: true,
            },
            giftCoins: 1250,
          }),
        );

        expect(html).toContain('audio-stage-badge');
        expect(html).toContain('🎙️ Live Audio Stage: 4 Speakers | 42 Listeners');
        expect(html).toContain('virtual-gift-badge');
        expect(html).toContain('🎁 Gifts: 1,250 Coins');
      });

      it('verifies Live Audio Room stage indicator and Virtual Gift badge are present in root Desktop Shell', () => {
        const html = renderToString(React.createElement(App));

        expect(html).toContain('desktop-shell-root');
        expect(html).toContain('🎙️ Live Audio Stage: 4 Speakers | 42 Listeners');
        expect(html).toContain('🎁 Gifts: 1,250 Coins');
      });

      it('renders full Ecosystem Overview Dashboard with Nexsas Bento, 4 KPI cards, and FAQ accordion when initialTab is dashboard', () => {
        const html = renderToString(
          React.createElement(App, {
            initialTab: 'dashboard',
          }),
        );

        expect(html).toContain('desktop-shell-root');
        expect(html).toContain('Quant Sovereign Ecosystem Overview');
        expect(html).toContain('Ecosystem Revenue');
        expect(html).toContain('$24,850');
        expect(html).toContain('1.4M Active Nodes');
        expect(html).toContain('99.99% Uptime');
        expect(html).toContain('64KB CAS Deduplication');
        expect(html).toContain('bento-feature-grid');
        expect(html).toContain('faq-accordion');
        expect(html).toContain('🎙️ Live Audio Stage: 4 Speakers | 42 Listeners');
        expect(html).toContain('🎁 Gifts: 1,250 Coins');
      });
    });
  });
});
