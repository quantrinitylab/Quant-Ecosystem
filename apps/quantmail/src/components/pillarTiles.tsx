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
import { PillarMascotMark } from './mascots/PillarMascotMark';
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
  // 3D Living Mascots (44px touch floor, 32px mascot)
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    shortcutNumber: 1,
    accentColor: PILLAR_ACCENTS.mail,
    renderIcon: (active) => <PillarMascotMark pillar="mail" size="sm" active={active} interactive={false} />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    shortcutNumber: 2,
    accentColor: PILLAR_ACCENTS.calendar,
    renderIcon: (active) => <PillarMascotMark pillar="calendar" size="sm" active={active} interactive={false} />,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    shortcutNumber: 3,
    accentColor: PILLAR_ACCENTS.drive,
    renderIcon: (active) => <PillarMascotMark pillar="drive" size="sm" active={active} interactive={false} />,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    shortcutNumber: 4,
    accentColor: PILLAR_ACCENTS.contacts,
    renderIcon: (active) => <PillarMascotMark pillar="contacts" size="sm" active={active} interactive={false} />,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    shortcutNumber: 5,
    accentColor: PILLAR_ACCENTS.quantgit,
    renderIcon: (active) => <PillarMascotMark pillar="quantgit" size="sm" active={active} interactive={false} />,
  },
];
