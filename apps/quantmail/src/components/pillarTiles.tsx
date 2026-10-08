'use client';

// ============================================================================
// QuantMail — Pillar tile definitions (shared)
// ============================================================================
// Single source of truth for the 5 suite-app tiles (Mail, Calendar, Drive,
// Contacts, QuantGit): ids, labels, routes, keyboard shortcuts, accent colors,
// and the real approved app marks. Shared by DesktopAppRail (live desktop
// switcher) and any other surface that needs the tile list.
//
// NOTE: accent colors come from PILLAR_ACCENTS (QM-UIUX-037) — the single
// source of truth shared with the mobile switcher. Do not hand-edit colors here.
// ============================================================================

import React from 'react';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';
// QM-UIUX-037: single accent-color source of truth (mobile values canonical).
import { PILLAR_ACCENTS } from './pillar-accents';

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
    accentColor: PILLAR_ACCENTS.mail,
    renderIcon: () => <QuantMailLogo size={28} interactive={false} showBadge={false} />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    shortcutNumber: 2,
    accentColor: PILLAR_ACCENTS.calendar,
    renderIcon: () => <QuantCalendarLogo size={28} />,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    shortcutNumber: 3,
    accentColor: PILLAR_ACCENTS.drive,
    renderIcon: () => <QuantDriveLogo size={28} />,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    shortcutNumber: 4,
    accentColor: PILLAR_ACCENTS.contacts,
    renderIcon: () => <QuantContactsLogo size={28} />,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    shortcutNumber: 5,
    accentColor: PILLAR_ACCENTS.quantgit,
    renderIcon: () => <QuantGitLogo size={28} />,
  },
];
