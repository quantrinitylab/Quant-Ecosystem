import React from 'react';
import type { NavItem } from '@quant/shared-ui';

// 5-tab Snapchat-style bottom bar. Stories, Spotlight and Memories are reachable
// from the Profile hub (see app/profile/page.tsx) to keep the bar to five tabs.
export const navItems: NavItem[] = [
  { id: 'chats', label: 'Chats', icon: <span>&#128172;</span> },
  { id: 'reels', label: 'Reels', icon: <span>&#127909;</span> },
  { id: 'camera', label: 'Camera', icon: <span>&#128247;</span> },
  { id: 'map', label: 'Map', icon: <span>&#127758;</span> },
  { id: 'profile', label: 'Profile', icon: <span>&#128100;</span> },
];

export const routes: Record<string, string> = {
  chats: '/',
  stories: '/stories',
  camera: '/camera',
  map: '/map',
  profile: '/profile',
  call: '/call',
  reels: '/reels',
  spotlight: '/spotlight',
  memories: '/memories',
  channels: '/channels',
};
