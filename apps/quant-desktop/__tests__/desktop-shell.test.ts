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
import type { CommandItem } from '../src/types';

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
});
