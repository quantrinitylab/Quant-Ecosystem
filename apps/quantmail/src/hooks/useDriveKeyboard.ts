'use client';

/**
 * Page-level keyboard commands for the drive surface (`shift+f` new folder,
 * `shift+t` new document).
 *
 * The j/k/x/enter/escape list-triage commands live with the list itself
 * (`DriveHomeSubView`), which owns the visible item order — the page cannot
 * know which items are on screen (category drill-down, recent strip). Splitting
 * by ownership is what keeps both halves reading from the same
 * `DRIVE_COMMAND_REFERENCE`: ids are never restated, so the `?` sheet documents
 * exactly the keys that are bound. Both halves register in the same `drive`
 * engine scope; scope depth resolves the shadowing deterministically.
 *
 * Input safety comes from the engine default: no binding here sets
 * `allowInInput`, so `shift+f`/`shift+t` stay inert while the caret is in a
 * text field (typing a capital F or T in the rename box must never pop the
 * new-folder dialog). `?` and `mod+k` are global and unmaskable, so they keep
 * working everywhere.
 */

import { useKeyboardScope, useRegisterCommands } from '../lib/keyboard/hooks';
import {
  driveCommand,
  type Command,
  type DriveCommandId,
} from '../lib/keyboard/command-registry';

const SCOPE = 'drive';

export interface UseDriveKeyboardOptions {
  /** Open the new-folder dialog. */
  onNewFolder: () => void;
  /** Open the new-document dialog. */
  onNewDocument: () => void;
  /** Set `false` on views that render the page but should not own the keys. */
  active?: boolean;
}

export function useDriveKeyboard(options: UseDriveKeyboardOptions): void {
  const { active = true, ...actions } = options;

  useKeyboardScope(SCOPE, { active });

  // Rebuilt every render and registered by structural signature, so the
  // closures stay fresh without churning the engine's binding table.
  // `run` and `enabled` are proxied live by `useRegisterCommands`.
  const live = (
    id: DriveCommandId,
    run: () => void,
    extra?: Partial<Command>,
  ): Command => ({
    ...driveCommand(id),
    scope: SCOPE,
    run,
    ...extra,
  });

  const commands: Command[] = [
    live('drive.newFolder', actions.onNewFolder),
    live('drive.newDocument', actions.onNewDocument),
  ];

  useRegisterCommands(commands);
}
