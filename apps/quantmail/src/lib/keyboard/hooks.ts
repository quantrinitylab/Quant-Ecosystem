'use client';

/**
 * React bindings for the keyboard engine and command registry.
 *
 * Every hook here registers by *structure* and reads handlers through a ref, so
 * a component can close over fresh state on each render without churning the
 * engine's binding table on every keystroke — the flaw in the old
 * `useInboxKeyboard`, which tore down and re-attached its `document` listener
 * each time the focused row changed.
 */

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import {
  getCommands,
  getVisibleCommands,
  registerCommands,
  subscribeToCommands,
  type Command,
} from './command-registry';
import { keyboardEngine, type BindingOptions, type ShortcutHandler } from './engine';

const EMPTY_COMMANDS: Command[] = [];
const EMPTY_CHORDS: string[] = [];

export interface UseShortcutOptions extends BindingOptions {
  /** Explicit id; defaults to a stable per-component generated one. */
  id?: string;
  /** Skip registration entirely — use for conditionally mounted shortcuts. */
  disabled?: boolean;
}

/**
 * Bind one ad-hoc shortcut for the lifetime of the component.
 *
 * ```tsx
 * useShortcut('mod+enter', send, { scope: 'composer', allowInInput: true });
 * ```
 *
 * Prefer registering a {@link Command} when the action should also be
 * discoverable in the palette; reach for this only for local, undocumented keys
 * such as a dialog's own arrow navigation.
 */
export function useShortcut(
  keys: string | string[],
  handler: ShortcutHandler,
  options: UseShortcutOptions = {},
): void {
  const generatedId = useId();
  const handlerRef = useRef(handler);
  const enabledRef = useRef(options.enabled);

  // Assigned in an effect rather than during render so the hook stays correct
  // under StrictMode double-invocation. Key presses can only arrive after
  // paint, by which point the refs are current.
  useEffect(() => {
    handlerRef.current = handler;
    enabledRef.current = options.enabled;
  });

  const {
    id,
    disabled,
    scope,
    priority,
    allowInInput,
    allowRepeat,
    preventDefault,
    stopPropagation,
    label,
  } = options;

  const bindingId = id ?? `shortcut:${generatedId}`;
  const keySignature = Array.isArray(keys) ? keys.join('|') : keys;

  useEffect(() => {
    if (disabled) return;
    return keyboardEngine.bind(
      bindingId,
      keySignature.split('|'),
      (event) => handlerRef.current(event),
      {
        scope,
        priority,
        allowInInput,
        allowRepeat,
        preventDefault,
        stopPropagation,
        label,
        enabled: () => enabledRef.current?.() ?? true,
      },
    );
  }, [
    bindingId,
    keySignature,
    disabled,
    scope,
    priority,
    allowInInput,
    allowRepeat,
    preventDefault,
    stopPropagation,
    label,
  ]);
}

/**
 * Structural fingerprint of a command list. Registration is refreshed only when
 * this changes — not when a handler closure is recreated, which happens on
 * every render.
 */
function commandSignature(commands: Command[]): string {
  return commands
    .map((command) => {
      const keys = Array.isArray(command.keys) ? command.keys.join(',') : (command.keys ?? '');
      return [
        command.id,
        keys,
        command.scope ?? '',
        command.group,
        command.label,
        command.hidden ? '1' : '',
        command.hiddenInHelp ? '1' : '',
        command.destructive ? '1' : '',
        command.priority ?? '',
        command.allowInInput ? '1' : '',
        command.allowRepeat === undefined ? '' : command.allowRepeat ? '1' : '0',
        command.preventDefault === false ? '0' : '',
        command.unmaskable ? '1' : '',
        command.icon ?? '',
        command.description ?? '',
        (command.keywords ?? []).join(','),
      ].join('');
    })
    .join('');
}

/**
 * Register a set of commands for as long as the component is mounted.
 *
 * The array may be rebuilt on every render — pass it inline. Only a change to
 * the commands' *shape* (ids, keys, labels, grouping) re-registers; `run` and
 * `enabled` are always read live, so they can close over current state.
 */
export function useRegisterCommands(commands: Command[]): void {
  const commandsRef = useRef(commands);

  useEffect(() => {
    commandsRef.current = commands;
  });

  const signature = commandSignature(commands);

  useEffect(() => {
    // Snapshot the shape once, then proxy `run`/`enabled` through the ref so
    // the registry always calls the latest closure.
    const proxied = commandsRef.current.map((command) => {
      const read = () => commandsRef.current.find((entry) => entry.id === command.id);
      return {
        ...command,
        run: () => read()?.run(),
        enabled: command.enabled ? () => read()?.enabled?.() ?? true : undefined,
      } satisfies Command;
    });
    return registerCommands(proxied);
    // `signature` is the intended dependency; `commandsRef` is stable.
  }, [signature]);
}

/** All registered commands, re-rendering when the registry changes. */
export function useCommandList(): Command[] {
  return useSyncExternalStore(subscribeToCommands, getCommands, () => EMPTY_COMMANDS);
}

/**
 * Registered commands that are currently enabled and not hidden.
 *
 * Deliberately unmemoised: `enabled()` reflects live application state, which
 * can flip without the registry itself changing. The filter runs over a few
 * dozen entries, so recomputing per render is cheaper than being wrong.
 */
export function useVisibleCommands(): Command[] {
  useCommandList();
  return getVisibleCommands();
}

export interface UseKeyboardScopeOptions {
  /** Whether the scope is currently active. Defaults to `true`. */
  active?: boolean;
  /**
   * Mask every shallower scope while active. What modals, dialogs and the
   * command palette want, so global single-key shortcuts cannot fire behind them.
   */
  exclusive?: boolean;
}

/**
 * Activate a named keyboard scope while a component is mounted (or while
 * `active` is true).
 *
 * ```tsx
 * useKeyboardScope('snooze-menu', { active: isOpen, exclusive: true });
 * ```
 */
export function useKeyboardScope(name: string, options: UseKeyboardScopeOptions = {}): void {
  const { active = true, exclusive = false } = options;
  useEffect(() => {
    if (!active) return;
    return keyboardEngine.pushScope(name, { exclusive });
  }, [name, active, exclusive]);
}

/**
 * Chords typed so far in an unfinished sequence — `['g']` while the user is
 * midway through `g i`. Drives the on-screen prefix hint.
 */
export function usePendingChords(): string[] {
  const subscribe = useCallback((listener: () => void) => keyboardEngine.subscribe(listener), []);
  const getSnapshot = useCallback(() => keyboardEngine.getPendingChords(), []);
  const getServerSnapshot = useCallback(() => EMPTY_CHORDS, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
