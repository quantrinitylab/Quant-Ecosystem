'use client';

// ============================================================================
// @quant/shared-ui - DesktopShell
// Amazon & Flipkart-parity 5-Pillar Squircle Mode Switcher & Dynamic Island
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';

export type PillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface PillarConfig {
  id: PillarId;
  name: string;
  tagline: string;
  accentColor: string; // e.g. #FF8C42
  hotkey: string; // e.g. Ctrl+1
  keyNumber: number; // 1..5
  route: string;
  description: string;
}

/**
 * The 5 Sovereign Pillars of Quant Desktop
 */
export const DESKTOP_PILLARS: readonly PillarConfig[] = [
  {
    id: 'mail',
    name: 'Mail',
    tagline: 'Sovereign Mailbox & Undo Send',
    accentColor: '#FF8C42',
    hotkey: 'Ctrl+1',
    keyNumber: 1,
    route: '/mail',
    description: 'Sub-5ms SQLite FTS5 Sovereign Mailbox with Superhuman Split Inboxes',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    tagline: 'RFC 5545 Recurrence & Public Booking',
    accentColor: '#F59E0B',
    hotkey: 'Ctrl+2',
    keyNumber: 2,
    route: '/calendar',
    description: 'Calendly-grade Public Booking Links, Slot Mutex Locks & Timezone Math',
  },
  {
    id: 'drive',
    name: 'Drive',
    tagline: 'FastCDC 64KB CAS Virtual Drive',
    accentColor: '#38BDF8',
    hotkey: 'Ctrl+3',
    keyNumber: 3,
    route: '/drive',
    description: 'Windows ProjFS G:\\ Virtual Drive with 64KB Gear CAS Chunk Deduplication',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    tagline: 'VIP Enterprise Directory & Sync',
    accentColor: '#10B981',
    hotkey: 'Ctrl+4',
    keyNumber: 4,
    route: '/contacts',
    description: 'VIP Directory with AI Deduplication Wizard and Unified Contact Cards',
  },
  {
    id: 'quantgit',
    name: 'QuantGit',
    tagline: 'Sovereign Git Daemon & 3-Way Merge',
    accentColor: '#A78BFA',
    hotkey: 'Ctrl+5',
    keyNumber: 5,
    route: '/quantgit',
    description: 'Git Smart HTTP Daemon with 3-Way Merge Engine and Code Inspector',
  },
] as const;

// ----------------------------------------------------------------------------
// Pure SVG Vector Icons (Strictly Zero Emojis)
// ----------------------------------------------------------------------------

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export function MailPillarIcon({ size = 18, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function CalendarPillarIcon({ size = 18, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <circle cx="8" cy="14" r="1" fill="currentColor" />
      <circle cx="12" cy="14" r="1" fill="currentColor" />
      <circle cx="16" cy="14" r="1" fill="currentColor" />
      <circle cx="8" cy="18" r="1" fill="currentColor" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

export function DrivePillarIcon({ size = 18, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <path d="M2 10h20" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function ContactsPillarIcon({ size = 18, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function QuantGitPillarIcon({ size = 18, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function QuantAiSparkleIcon({ size = 14, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
    </svg>
  );
}

export function SovereignClusterSignalIcon({ size = 14, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function MinimizeWindowIcon({ size = 12, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  );
}

export function MaximizeWindowIcon({ size = 11, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
    </svg>
  );
}

export function CloseWindowIcon({ size = 12, className = '', ...props }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </svg>
  );
}

/**
 * Returns the matching SVG pillar icon for a given PillarId
 */
export function getPillarIcon(id: PillarId, props?: IconProps): React.ReactElement {
  switch (id) {
    case 'mail':
      return <MailPillarIcon {...props} />;
    case 'calendar':
      return <CalendarPillarIcon {...props} />;
    case 'drive':
      return <DrivePillarIcon {...props} />;
    case 'contacts':
      return <ContactsPillarIcon {...props} />;
    case 'quantgit':
      return <QuantGitPillarIcon {...props} />;
  }
}

// ----------------------------------------------------------------------------
// Dynamic Island Capsule Component
// ----------------------------------------------------------------------------

export interface DynamicIslandCapsuleProps {
  statusText?: string;
  connected?: boolean;
  latencyText?: string;
  className?: string;
  onClick?: () => void;
}

export const DynamicIslandCapsule: React.FC<DynamicIslandCapsuleProps> = ({
  statusText = 'Connected',
  connected = true,
  latencyText = '<5ms',
  className = '',
  onClick,
}) => {
  return (
    <div
      className={`quant-dynamic-island-capsule ${className}`}
      data-testid="dynamic-island-capsule"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 14px',
        borderRadius: '9999px',
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow:
          '0 4px 20px -2px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        color: '#f8fafc',
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '-0.01em',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
      }}
    >
      {/* AI Sparkle Icon with sovereign glow */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a78bfa',
          filter: 'drop-shadow(0 0 6px rgba(167, 139, 250, 0.5))',
        }}
        data-testid="dynamic-island-ai-icon"
      >
        <QuantAiSparkleIcon size={14} />
      </span>

      {/* Brand & Connection State */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
          Quant AI:
        </span>
        <span style={{ color: connected ? '#34d399' : '#f87171', fontWeight: 600 }}>
          {statusText}
        </span>
      </div>

      {/* Separator Bullet */}
      <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '10px' }}>·</span>

      {/* Sovereign Cluster Telemetry */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          color: '#94a3b8',
        }}
      >
        <span
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '7px',
            height: '7px',
          }}
        >
          <span
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '9999px',
              backgroundColor: '#10b981',
              opacity: 0.75,
              animation: 'quant-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
          <span
            style={{
              position: 'relative',
              width: '5px',
              height: '5px',
              borderRadius: '9999px',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px #10b981',
            }}
          />
        </span>
        <span>Sovereign Cluster</span>
        <span
          style={{
            fontWeight: 700,
            color: '#34d399',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '11px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            padding: '1px 5px',
            borderRadius: '4px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}
          data-testid="dynamic-island-latency"
        >
          {latencyText}
        </span>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// 5-Pillar Squircle Mode Switcher Component
// ----------------------------------------------------------------------------

export interface SquircleModeSwitcherProps {
  pillars?: readonly PillarConfig[];
  activePillar: PillarId;
  onSelectPillar: (pillarId: PillarId) => void;
  className?: string;
  isMac?: boolean;
}

export const SquircleModeSwitcher: React.FC<SquircleModeSwitcherProps> = ({
  pillars = DESKTOP_PILLARS,
  activePillar,
  onSelectPillar,
  className = '',
  isMac = false,
}) => {
  return (
    <nav
      className={`quant-squircle-mode-switcher ${className}`}
      role="tablist"
      aria-label="5-Pillar Mode Switcher"
      data-testid="squircle-mode-switcher"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px',
        borderRadius: '14px',
        background: 'rgba(11, 15, 25, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {pillars.map((pillar) => {
        const isActive = pillar.id === activePillar;
        const hotkeyLabel = isMac ? `⌘${pillar.keyNumber}` : `^${pillar.keyNumber}`;

        return (
          <button
            key={pillar.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`pillar-panel-${pillar.id}`}
            id={`pillar-tab-${pillar.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectPillar(pillar.id)}
            data-testid={`squircle-tile-${pillar.id}`}
            data-pillar-id={pillar.id}
            data-active={isActive ? 'true' : 'false'}
            title={`${pillar.name} (${pillar.hotkey}): ${pillar.tagline}`}
            className="quant-squircle-tile"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '11px', // Squircle curve
              border: isActive
                ? `1px solid ${pillar.accentColor}66`
                : '1px solid transparent',
              background: isActive
                ? `${pillar.accentColor}18`
                : 'transparent',
              boxShadow: isActive
                ? `0 0 18px -2px ${pillar.accentColor}44, 0 4px 12px rgba(0, 0, 0, 0.35)`
                : 'none',
              color: isActive ? '#ffffff' : 'rgba(248, 250, 252, 0.65)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              userSelect: 'none',
            }}
          >
            {/* Vector Icon */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? pillar.accentColor : 'currentColor',
                filter: isActive
                  ? `drop-shadow(0 0 6px ${pillar.accentColor}88)`
                  : 'none',
                transition: 'all 0.2s ease',
              }}
              data-testid={`squircle-icon-${pillar.id}`}
            >
              {getPillarIcon(pillar.id, { size: 16 })}
            </span>

            {/* Crisp Wordmark */}
            <span
              style={{
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '-0.01em',
                color: isActive ? '#ffffff' : 'rgba(248, 250, 252, 0.85)',
              }}
              data-testid={`squircle-wordmark-${pillar.id}`}
            >
              {pillar.name}
            </span>

            {/* Keyboard Hotkey Badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                padding: '1px 4px',
                borderRadius: '4px',
                backgroundColor: isActive
                  ? `${pillar.accentColor}26`
                  : 'rgba(255, 255, 255, 0.06)',
                color: isActive
                  ? pillar.accentColor
                  : 'rgba(255, 255, 255, 0.4)',
                border: isActive
                  ? `1px solid ${pillar.accentColor}44`
                  : '1px solid rgba(255, 255, 255, 0.08)',
                transition: 'all 0.2s ease',
              }}
              data-testid={`squircle-hotkey-${pillar.id}`}
            >
              {hotkeyLabel}
            </span>

            {/* Subtle Bottom Accent Line for Active Mode */}
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '-1px',
                  left: '18%',
                  right: '18%',
                  height: '2.5px',
                  borderRadius: '9999px',
                  backgroundColor: pillar.accentColor,
                  boxShadow: `0 0 8px ${pillar.accentColor}, 0 0 2px ${pillar.accentColor}`,
                }}
                data-testid={`squircle-accent-line-${pillar.id}`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
};

// ----------------------------------------------------------------------------
// DesktopShell Master Component
// ----------------------------------------------------------------------------

export interface DesktopShellProps {
  children?: React.ReactNode;
  activePillar?: PillarId;
  defaultPillar?: PillarId;
  onSelectPillar?: (pillarId: PillarId) => void;
  brandTitle?: string;
  clusterLatency?: string;
  isClusterConnected?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  headerRightSlot?: React.ReactNode;
  className?: string;
}

export const DesktopShell: React.FC<DesktopShellProps> = ({
  children,
  activePillar: controlledActivePillar,
  defaultPillar = 'mail',
  onSelectPillar,
  brandTitle = 'Quant Desktop',
  clusterLatency = '<5ms',
  isClusterConnected = true,
  onMinimize,
  onMaximize,
  onClose,
  headerRightSlot,
  className = '',
}) => {
  const [internalPillar, setInternalPillar] = useState<PillarId>(defaultPillar);
  const isControlled = controlledActivePillar !== undefined;
  const activePillar = isControlled ? controlledActivePillar : internalPillar;

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const handleSelectPillar = useCallback(
    (nextPillar: PillarId) => {
      if (!isControlled) {
        setInternalPillar(nextPillar);
      }
      onSelectPillar?.(nextPillar);
    },
    [isControlled, onSelectPillar],
  );

  // Global Keyboard Shortcuts: Bind Ctrl+1..5 (or Cmd+1..5 on macOS) to instantly switch active pillar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must have Ctrl or Cmd pressed, but not Alt or Shift (so it doesn't conflict with OS or editing hotkeys)
      const modifier = e.ctrlKey || e.metaKey;
      if (!modifier || e.altKey || e.shiftKey) return;

      let num = parseInt(e.key, 10);
      if (isNaN(num) && e.code) {
        if (e.code.startsWith('Digit')) {
          num = parseInt(e.code.slice(5), 10);
        } else if (e.code.startsWith('Numpad')) {
          num = parseInt(e.code.slice(6), 10);
        }
      }

      if (num >= 1 && num <= DESKTOP_PILLARS.length) {
        e.preventDefault();
        const targetPillar = DESKTOP_PILLARS[num - 1];
        if (targetPillar) {
          handleSelectPillar(targetPillar.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectPillar]);

  const activeConfig = useMemo(
    () => DESKTOP_PILLARS.find((p) => p.id === activePillar) || DESKTOP_PILLARS[0]!,
    [activePillar],
  );

  return (
    <div
      className={`quant-desktop-shell-root ${className}`}
      data-testid="quant-desktop-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100vh',
        background: '#07090e',
        color: '#f8fafc',
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes quant-ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .quant-squircle-tile:hover {
          background-color: rgba(255, 255, 255, 0.06) !important;
          transform: translateY(-1px);
        }
        .quant-squircle-tile[data-active="true"]:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* 1. Top Sovereign Titlebar with Squircle Mode Switcher & Dynamic Island */}
      <header
        className="quant-desktop-header"
        data-testid="quant-desktop-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '46px',
          padding: '0 14px',
          background: 'rgba(11, 15, 25, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        {/* Left: Brand Identity with Sovereign Vector Glyph */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: '220px',
          }}
          data-testid="header-brand-section"
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: '0 0 12px rgba(79, 70, 229, 0.45)',
            }}
            data-testid="brand-glyph"
          >
            Q
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: '14px',
              letterSpacing: '-0.02em',
              color: '#ffffff',
            }}
          >
            {brandTitle}
          </span>
        </div>

        {/* Center: Top Squircle Mode Switcher & Dynamic Island Capsule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
          data-testid="header-center-section"
        >
          {/* 5-Pillar Squircle Mode Switcher */}
          <SquircleModeSwitcher
            activePillar={activePillar}
            onSelectPillar={handleSelectPillar}
            isMac={isMac}
          />

          {/* Dynamic Island Capsule */}
          <DynamicIslandCapsule
            connected={isClusterConnected}
            latencyText={clusterLatency}
          />
        </div>

        {/* Right: Window Controls / Additional Slot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '220px',
            justifyContent: 'flex-end',
          }}
          data-testid="header-right-section"
        >
          {headerRightSlot}

          {/* Window Min/Max/Close Controls with pure SVGs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: '8px',
            }}
            data-testid="window-controls-bar"
          >
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize"
              aria-label="Minimize Window"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '26px',
                background: 'transparent',
                border: 'none',
                borderRadius: '5px',
                color: 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <MinimizeWindowIcon size={12} />
            </button>
            <button
              type="button"
              onClick={onMaximize}
              title="Maximize / Restore"
              aria-label="Maximize Window"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '26px',
                background: 'transparent',
                border: 'none',
                borderRadius: '5px',
                color: 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <MaximizeWindowIcon size={11} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close Window"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '26px',
                background: 'transparent',
                border: 'none',
                borderRadius: '5px',
                color: 'rgba(255, 255, 255, 0.65)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <CloseWindowIcon size={12} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Content Viewport */}
      <main
        id={`pillar-panel-${activePillar}`}
        role="tabpanel"
        aria-labelledby={`pillar-tab-${activePillar}`}
        data-testid={`pillar-panel-${activePillar}`}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {children ?? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px',
              textAlign: 'center',
            }}
            data-testid="default-pillar-placeholder"
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                backgroundColor: `${activeConfig.accentColor}20`,
                border: `1px solid ${activeConfig.accentColor}44`,
                boxShadow: `0 0 24px -4px ${activeConfig.accentColor}66`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeConfig.accentColor,
                marginBottom: '16px',
              }}
            >
              {getPillarIcon(activeConfig.id, { size: 30 })}
            </div>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: '8px',
              }}
            >
              {activeConfig.name}
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                maxWidth: '460px',
                lineHeight: 1.5,
              }}
            >
              {activeConfig.description}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};
