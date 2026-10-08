'use client';

// ============================================================================
// QuantMail — Pillar tile definitions (shared)
// ============================================================================
// Single source of truth for the 5 suite-app tiles (Mail, Calendar, Drive,
// Contacts, QuantGit): ids, labels, routes, keyboard shortcuts, accent colors,
// and the real approved app marks. Shared by DesktopAppRail (live desktop
// switcher) and any other surface that needs the tile list.
//
// NOTE: accent colors here are the desktop rail values. QM-UIUX-037 will unify
// the mobile and desktop accent systems into one PILLAR_ACCENTS source; do not
// hand-edit colors without that task.
// ============================================================================

import React from 'react';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';

export type PillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface DesktopPillarTile {
  id: PillarId;
  label: string;
  path: string;
  shortcutNumber: number;
  accentColor: string;
  renderIcon: (active: boolean) => React.ReactNode;
}

export const DESKTOP_PILLAR_TILES: DesktopPillarTile[] = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    shortcutNumber: 1,
    accentColor: '#FF8C42',
    renderIcon: () => <QuantMailLogo size={28} interactive={false} showBadge={false} />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    shortcutNumber: 2,
    accentColor: '#3B82F6',
    renderIcon: () => <QuantCalendarLogo size={28} />,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    shortcutNumber: 3,
    accentColor: '#F59E0B',
    renderIcon: () => <QuantDriveLogo size={28} />,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    shortcutNumber: 4,
    accentColor: '#10B981',
    renderIcon: () => <QuantContactsLogo size={28} />,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    shortcutNumber: 5,
    accentColor: '#8B5CF6',
    renderIcon: () => <QuantGitLogo size={28} />,
  },
];
