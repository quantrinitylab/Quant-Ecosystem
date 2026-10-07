'use client';
import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { CommandPaletteUI } from './index';
import type { CommandPaletteItem } from './index';

interface CommandPaletteContextValue {
  registerCommand: (command: CommandPaletteItem) => () => void;
  unregisterCommand: (id: string) => void;
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  return ctx;
}

// Built-in cross-app navigation commands
const CROSS_APP_COMMANDS: CommandPaletteItem[] = [
  {
    id: 'nav-mail',
    label: 'Go to QuantMail (Inbox)',
    group: 'Workspace',
    shortcut: 'G I',
    action: () => {
      window.location.href = '/';
    },
  },
  {
    id: 'nav-calendar',
    label: 'Go to QuantCalendar',
    group: 'Workspace',
    shortcut: 'G C',
    action: () => {
      window.location.href = '/calendar';
    },
  },
  {
    id: 'nav-drive',
    label: 'Go to QuantDrive',
    group: 'Workspace',
    shortcut: 'G V',
    action: () => {
      window.location.href = '/drive';
    },
  },
  {
    id: 'nav-contacts',
    label: 'Go to QuantContacts',
    group: 'Workspace',
    shortcut: 'G A',
    action: () => {
      window.location.href = '/contacts';
    },
  },
  {
    id: 'nav-code',
    label: 'Go to QuantGit (CodeHub)',
    group: 'Workspace',
    shortcut: 'G K',
    action: () => {
      window.location.href = '/codehub';
    },
  },
  {
    id: 'nav-settings',
    label: 'Open Settings & Preferences',
    group: 'Control',
    shortcut: 'G ,',
    action: () => {
      window.location.href = '/settings';
    },
  },
  {
    id: 'nav-security',
    label: 'Account Security & 2FA',
    group: 'Control',
    shortcut: 'G 2',
    action: () => {
      window.location.href = '/security';
    },
  },
];

interface CommandPaletteProviderProps {
  children: React.ReactNode;
  appName?: string;
}

export function CommandPaletteProvider({ children, appName }: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const commandsRef = useRef<Map<string, CommandPaletteItem>>(new Map());
  const [commandsVersion, setCommandsVersion] = useState(0);

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const registerCommand = useCallback((command: CommandPaletteItem) => {
    commandsRef.current.set(command.id, command);
    setCommandsVersion((v) => v + 1);
    return () => {
      commandsRef.current.delete(command.id);
      setCommandsVersion((v) => v + 1);
    };
  }, []);

  const unregisterCommand = useCallback((id: string) => {
    commandsRef.current.delete(id);
    setCommandsVersion((v) => v + 1);
  }, []);

  const allCommands = useMemo(() => {
    void commandsVersion; // trigger recompute
    return [...CROSS_APP_COMMANDS, ...Array.from(commandsRef.current.values())];
  }, [commandsVersion]);

  const value: CommandPaletteContextValue = useMemo(
    () => ({
      registerCommand,
      unregisterCommand,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [registerCommand, unregisterCommand, isOpen],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteUI
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        commands={allCommands}
        placeholder={appName ? `Search ${appName} commands...` : 'Search commands...'}
      />
    </CommandPaletteContext.Provider>
  );
}
