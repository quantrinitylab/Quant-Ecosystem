'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PILLAR_ACCENTS } from '../pillar-accents';

export type MascotPillar = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';
export type MascotSize = 'xs' | 'sm' | 'md' | 'lg' | 'hero';

interface PillarMascotMarkProps {
  pillar: MascotPillar;
  size?: MascotSize;
  active?: boolean;
  interactive?: boolean;
  unreadCount?: number;
  className?: string;
  onClick?: () => void;
  title?: string;
  showHalo?: boolean;
}

const SIZE_MAP: Record<MascotSize, { px: number; assetSuffix: string; className: string }> = {
  xs: { px: 24, assetSuffix: 'xs', className: 'size-6' },
  sm: { px: 34, assetSuffix: 'sm', className: 'size-[34px]' },
  md: { px: 44, assetSuffix: 'md', className: 'size-11' },
  lg: { px: 80, assetSuffix: 'lg', className: 'size-20' },
  hero: { px: 140, assetSuffix: 'hero', className: 'size-[140px]' },
};

// `label` is the mark's ACCESSIBLE NAME: it is rendered as the wrapper's
// aria-label, the img alt text and the title fallback. It must stay the
// exact product name — the same names the previous approved marks used
// (QuantDriveLogo/QuantContactsLogo/QuantGitLogo carried
// aria-label="QuantDrive"/"QuantContacts"/"QuantGit"). Descriptive phrases
// here break screen-reader naming and the mobile-shell-overhaul contract.
const PILLAR_META: Record<
  MascotPillar,
  { label: string; glowColor: string }
> = {
  mail: {
    label: 'QuantMail',
    glowColor: 'rgba(255, 107, 53, 0.45)',
  },
  calendar: {
    label: 'QuantCalendar',
    glowColor: 'rgba(66, 133, 244, 0.45)',
  },
  drive: {
    label: 'QuantDrive',
    glowColor: 'rgba(52, 168, 83, 0.45)',
  },
  contacts: {
    label: 'QuantContacts',
    glowColor: 'rgba(245, 158, 11, 0.45)',
  },
  quantgit: {
    label: 'QuantGit',
    glowColor: 'rgba(139, 92, 246, 0.45)',
  },
};

export function PillarMascotMark({
  pillar,
  size = 'md',
  active = false,
  interactive = true,
  unreadCount,
  className = '',
  onClick,
  title,
  showHalo = true,
}: PillarMascotMarkProps) {
  const meta = PILLAR_META[pillar];
  const accentColor = PILLAR_ACCENTS[pillar];
  const sizeConfig = SIZE_MAP[size];
  const containerRef = useRef<HTMLDivElement>(null);

  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

  // Subtle natural blink interval every 4-7 seconds
  useEffect(() => {
    let blinkTimeout: NodeJS.Timeout;
    const scheduleNextBlink = () => {
      const delay = 4000 + Math.random() * 3000;
      blinkTimeout = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleNextBlink();
        }, 180);
      }, delay);
    };

    scheduleNextBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  // 3D perspective mouse tilt handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2; // -1 to 1
      setTilt({ x: nx, y: ny });
    },
    [interactive]
  );

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  const handleClick = useCallback(() => {
    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 450);
    onClick?.();
  }, [onClick]);

  const assetSrc = `/mascots/${pillar}-${sizeConfig.assetSuffix}.webp`;
  const fallbackSrc = `/mascots/${pillar}-${sizeConfig.assetSuffix}.png`;

  const tiltStyle: React.CSSProperties = {
    transform: `perspective(360px) rotateX(${tilt.y * -14}deg) rotateY(${tilt.x * 14}deg) ${
      isHovered ? 'scale3d(1.08, 1.08, 1.08)' : 'scale3d(1, 1, 1)'
    } ${isBouncing ? 'scale3d(0.88, 1.14, 1)' : ''}`,
    transition: isHovered
      ? 'transform 120ms cubic-bezier(0.2, 0, 0, 1)'
      : 'transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center select-none ${
        sizeConfig.className
      } ${interactive ? 'cursor-pointer' : ''} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      title={title || meta.label}
      role={interactive ? 'button' : 'img'}
      aria-label={meta.label}
    >
      {/* Volumetric dynamic ambient halo */}
      {showHalo && (active || isHovered) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-full blur-md opacity-80 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${meta.glowColor} 0%, transparent 70%)`,
            transform: isHovered ? 'scale(1.35)' : 'scale(1.15)',
          }}
        />
      )}

      {/* 3D Mascot Image with Living Physics */}
      <div
        className={`relative w-full h-full flex items-center justify-center origin-bottom ${
          isBlinking ? 'scale-y-[0.85] transition-transform duration-100' : ''
        }`}
        style={tiltStyle}
      >
        <picture className="w-full h-full flex items-center justify-center pointer-events-none">
          <source srcSet={assetSrc} type="image/webp" />
          <img
            src={fallbackSrc}
            alt={meta.label}
            width={sizeConfig.px}
            height={sizeConfig.px}
            className="w-full h-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
            draggable={false}
            loading={size === 'sm' || size === 'md' ? 'eager' : 'lazy'}
          />
        </picture>
      </div>

      {/* Unread Alert Pip / Bubble */}
      {unreadCount !== undefined && unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-lg border border-black/40 animate-pulse pointer-events-none"
          style={{ backgroundColor: accentColor }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}
