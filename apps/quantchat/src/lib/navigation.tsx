import React from 'react';
import type { NavItem } from '@quant/shared-ui';

export const navItems: NavItem[] = [
  { id: 'chats', label: 'Chats', icon: <span>&#128172;</span> },
  { id: 'stories', label: 'Stories', icon: <span>&#9711;</span> },
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
};
