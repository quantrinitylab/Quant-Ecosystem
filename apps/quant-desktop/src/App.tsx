import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QUANT_SOVEREIGN_APPS } from './constants/apps';
import { TitleBar } from './components/TitleBar';
import { Dock } from './components/Dock';
import { AppFrame } from './components/AppFrame';
import { CommandPalette } from './components/CommandPalette';
import { vfsService } from './services/vfs-bridge';
import { toggleMaximizeDesktopWindow } from './services/tauri';
import type { AppId, CommandItem } from './types';
import './styles.css';

export function App(): React.ReactElement {
  const [activeAppId, setActiveAppId] = useState<AppId>('quantmail');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const activeApp = useMemo(() => {
    return QUANT_SOVEREIGN_APPS.find((app) => app.id === activeAppId) || QUANT_SOVEREIGN_APPS[0];
  }, [activeAppId]);

  const selectApp = useCallback((appId: AppId) => {
    setActiveAppId(appId);
  }, []);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K and Alt+1..6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for Unified Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
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
  }, [selectApp]);

  // Unified Command Palette Items
  const commands: CommandItem[] = useMemo(() => {
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

    return [...appCommands, ...vfsCommands, ...windowCommands];
  }, [selectApp]);

  return (
    <div className="desktop-shell-root">
      {/* 1. Desktop Window Titlebar & Window Controls */}
      <TitleBar activeApp={activeApp} />

      {/* 2. Embedded Active App Frame Viewport */}
      <div className="desktop-content-area">
        <AppFrame app={activeApp} />
      </div>

      {/* 3. Frosted Glass Multi-App Switcher Dock */}
      <Dock
        apps={QUANT_SOVEREIGN_APPS}
        activeAppId={activeAppId}
        onSelectApp={selectApp}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* 4. Global Cmd+K / Ctrl+K Unified Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}
