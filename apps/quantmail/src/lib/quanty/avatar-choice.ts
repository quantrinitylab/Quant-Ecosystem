/**
 * Which Quanty the user picked — the one face of the AI teammate everywhere.
 *
 * Quant Workplace lets the user choose how Quanty looks. The choice is a pure
 * presentation preference, so it lives in `localStorage` (per device, no
 * account round-trip) and every `<Quanty>` reads it through
 * {@link useQuantyAvatar}. Changing it in the picker re-renders every mounted
 * Quanty at once — the sidebar card, the top-bar button and the drawer header
 * never disagree about who the teammate is.
 *
 * `classic` is the original white ghost (`BubbleAvatar` from
 * `@quant/shared-ui`); the others are illustrated portraits served from
 * `/public/quanty`.
 */
import { useSyncExternalStore } from 'react';

export type QuantyAvatarId = 'ember' | 'moss' | 'bloop' | 'specs' | 'spike' | 'nova' | 'classic';

export interface QuantyAvatarOption {
  id: QuantyAvatarId;
  name: string;
  /** One-line personality shown under the portrait in the picker. */
  vibe: string;
  /** The portrait's signature colour (picker ring + check). */
  color: string;
  /** Portrait image; `null` for the classic ghost, which is drawn live. */
  src: string | null;
}

export const QUANTY_AVATARS: readonly QuantyAvatarOption[] = [
  { id: 'ember', name: 'Ember', vibe: 'Warm & quick', color: '#FF7A45', src: '/quanty/ember.svg' },
  { id: 'moss', name: 'Moss', vibe: 'Calm & focused', color: '#3DDC6A', src: '/quanty/moss.svg' },
  { id: 'bloop', name: 'Bloop', vibe: 'Friendly helper', color: '#5AA8FF', src: '/quanty/bloop.svg' },
  { id: 'specs', name: 'Specs', vibe: 'Detail nerd', color: '#B5E83A', src: '/quanty/specs.svg' },
  { id: 'spike', name: 'Spike', vibe: 'Bold & direct', color: '#3F6BFF', src: '/quanty/spike.svg' },
  { id: 'nova', name: 'Nova', vibe: 'Dreamy & creative', color: '#A57BFF', src: '/quanty/nova.svg' },
  { id: 'classic', name: 'Classic', vibe: 'The original', color: '#B05CFF', src: null },
];

export const DEFAULT_QUANTY_AVATAR: QuantyAvatarId = 'ember';
export const QUANTY_AVATAR_STORAGE_KEY = 'quant_quanty_avatar';
/** Window event that asks the mounted picker host to open. */
export const QUANTY_AVATAR_PICKER_EVENT = 'quant:quanty-avatar-picker';
const CHANGE_EVENT = 'quant:quanty-avatar-change';

/** Used only when storage is unavailable, so the choice still sticks this session. */
let memoryChoice: QuantyAvatarId | null = null;

function isAvatarId(value: unknown): value is QuantyAvatarId {
  return typeof value === 'string' && QUANTY_AVATARS.some((a) => a.id === value);
}

export function getQuantyAvatar(id: string | null | undefined): QuantyAvatarOption {
  return QUANTY_AVATARS.find((a) => a.id === id) ?? QUANTY_AVATARS[0];
}

export function readQuantyAvatarId(): QuantyAvatarId {
  if (typeof window === 'undefined') return DEFAULT_QUANTY_AVATAR;
  try {
    const stored = window.localStorage.getItem(QUANTY_AVATAR_STORAGE_KEY);
    return isAvatarId(stored) ? stored : DEFAULT_QUANTY_AVATAR;
  } catch {
    // Storage can throw (Safari private mode, blocked cookies): fall back to
    // the default rather than blanking the mascot.
    return DEFAULT_QUANTY_AVATAR;
  }
}

export function setQuantyAvatarId(id: QuantyAvatarId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUANTY_AVATAR_STORAGE_KEY, id);
    memoryChoice = null;
  } catch {
    // Not persisted, but still applied for this page view below.
    memoryChoice = id;
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: id }));
}

function snapshot(): QuantyAvatarId {
  return memoryChoice ?? readQuantyAvatarId();
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === QUANTY_AVATAR_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The current choice; the server render (and first hydration pass) uses the default. */
export function useQuantyAvatar(): QuantyAvatarOption {
  const id = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_QUANTY_AVATAR);
  return getQuantyAvatar(id);
}

export function openQuantyAvatarPicker(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUANTY_AVATAR_PICKER_EVENT));
}
