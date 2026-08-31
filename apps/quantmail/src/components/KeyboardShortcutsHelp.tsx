'use client';

/**
 * The keyboard shortcuts sheet.
 *
 * Generated from the command registry rather than a hand-written table, so it can
 * no longer claim a key that does nothing — the previous version documented
 * `Z` for undo and `⌘S` for save draft, neither of which was bound anywhere. Only
 * commands that are actually registered are listed, and each binding is rendered
 * from the same string the engine matches against.
 *
 * Commands whose `enabled()` guard is currently false are listed but dimmed. They
 * used to be filtered out, which is why the sheet showed ten navigation keys
 * beside a single compose key: every conversation action (`e`, `s`, `u`, `#`,
 * `r`, `f`, `x`) is gated on a focused row, so opening the sheet from a fresh
 * inbox erased the entire section. A shortcuts *reference* should answer "what
 * keys exist here", not "what can I press this exact millisecond".
 *
 * The same argument applies one level up. Those bindings are registered by
 * `useInboxKeyboard`, which only the inbox mounts, so opening this panel from
 * Calendar or Drive dropped Conversation and Selection entirely and left two
 * short columns beside a column of dead space. `INBOX_COMMAND_REFERENCE` fills
 * them in from the declarations the inbox registers from — same labels, same
 * keys, dimmed — so the sheet is a reference to the app rather than to the
 * current route.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useId, useMemo } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import { chordToLabelParts, parseSequence } from '../lib/keyboard/chords';
import {
  COMMAND_GROUPS,
  INBOX_COMMAND_REFERENCE,
  type CommandGroup,
} from '../lib/keyboard/command-registry';
import { useCommandList, useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { IconX } from './icons';
import { useKeyboardSurfaces } from './KeyboardProvider';

const SCOPE = 'shortcuts-help';

interface HelpEntry {
  id: string;
  label: string;
  keys: string | string[];
  /** Bound and pressable right now. */
  available: boolean;
  /** Documented from the reference because its surface is not mounted. */
  elsewhere: boolean;
  destructive: boolean;
}

export function KeyboardShortcutsHelp() {
  const { isHelpOpen, closeHelp } = useKeyboardSurfaces();
  const commands = useCommandList();

  useKeyboardScope(SCOPE, { active: isHelpOpen, exclusive: true });
  useShortcut(['escape', '?'], closeHelp, { scope: SCOPE, disabled: !isHelpOpen });

  const titleId = useId();

  /**
   * A keyboard-shortcuts reference that could not be reached by keyboard: focus
   * stayed on whatever was behind it, so Tab walked the inbox underneath an
   * `aria-modal="true"` surface and the panel's own close button was never a
   * stop. `onEscape` is omitted because the keyboard engine already owns Escape
   * for this scope, one line above.
   */
  const panelRef = useFocusTrap<HTMLDivElement>({ active: isHelpOpen });

  const groups = useMemo(() => {
    const byGroup = new Map<CommandGroup, HelpEntry[]>();
    const add = (group: CommandGroup, entry: HelpEntry) => {
      const existing = byGroup.get(group);
      if (existing) existing.push(entry);
      else byGroup.set(group, [entry]);
    };

    const registered = new Set<string>();
    for (const command of commands) {
      if (!command.keys || command.hiddenInHelp) continue;
      registered.add(command.id);
      add(command.group, {
        id: command.id,
        label: command.label,
        keys: command.keys,
        available: !command.enabled || command.enabled(),
        elsewhere: false,
        destructive: !!command.destructive,
      });
    }

    // Only the ids the inbox has not already registered, so the live command —
    // with its live label, `u` reading "Mark as read" on an unread row — always
    // wins over the static one.
    for (const reference of INBOX_COMMAND_REFERENCE) {
      if (registered.has(reference.id)) continue;
      add(reference.group, {
        id: reference.id,
        label: reference.label,
        keys: reference.keys,
        available: false,
        elsewhere: true,
        destructive: !!reference.destructive,
      });
    }

    // Available bindings first within a section, so the dimmed contextual ones
    // collect at the bottom instead of interleaving with what works right now.
    // Destructive last regardless, matching the palette's ordering.
    for (const entries of byGroup.values()) {
      entries.sort(
        (a, b) =>
          Number(b.available) - Number(a.available) ||
          Number(a.destructive) - Number(b.destructive),
      );
    }
    return COMMAND_GROUPS.filter((group) => byGroup.has(group)).map((group) => ({
      group,
      items: byGroup.get(group)!,
    }));
  }, [commands]);

  const allItems = groups.flatMap(({ items }) => items);
  const hasElsewhere = allItems.some((item) => item.elsewhere);
  const hasContextual = allItems.some((item) => !item.available && !item.elsewhere);
  // Two different reasons a row is dim, and telling the user the wrong one is
  // worse than telling them nothing: "pick a conversation" is unactionable
  // advice on the Calendar page.
  const dimNote = hasElsewhere
    ? ' · dimmed keys apply to the inbox'
    : hasContextual
      ? ' · dimmed keys need a focused conversation'
      : '';

  return (
    <AnimatePresence>
      {isHelpOpen && (
        <motion.div
          className="shortcuts-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={closeHelp}
        >
          <motion.div
            ref={panelRef}
            className="shortcuts-panel"
            /*
             * `role`, `aria-modal` and the accessible name were on the overlay,
             * which made the click-to-dismiss scrim the dialog itself: the
             * announced region stretched across the whole viewport and the name
             * hung on an element whose entire job is to be ignored. They belong
             * on the panel, and the name now comes from the heading that is
             * already on screen rather than a duplicate string.
             */
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shortcuts-header">
              <h2 id={titleId}>Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={closeHelp}
                aria-label="Close keyboard shortcuts"
                className="grid h-11 w-11 place-items-center rounded-lg text-[#A1A4AC] transition-colors hover:bg-[#282C35] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <IconX size={16} strokeWidth={1.8} />
              </button>
            </header>

            <div className="shortcuts-body">
              {groups.map(({ group, items }) => (
                <section key={group}>
                  <h3>{group === 'Conversation' ? 'Conversation actions' : group}</h3>
                  <ul>
                    {items.map((item) => (
                      <li key={item.id} className={item.available ? undefined : 'is-unavailable'}>
                        <span className="shortcut-desc">{item.label}</span>
                        <span className="shortcut-keys">
                          <BindingKeys keys={item.keys} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <footer className="shortcuts-footer">
              <span>
                Press <kbd>?</kbd> to toggle this panel · <kbd>Esc</kbd> to close
                {dimNote}
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Render one binding as separate `kbd` pills. Sequences read as `G` then `I`
 * rather than a single opaque "GI", because they are pressed in turn.
 */
function BindingKeys({ keys }: { keys: string | string[] }) {
  // Only the primary binding is documented; aliases would double the sheet's
  // length without telling the user anything new.
  const primary = Array.isArray(keys) ? keys[0] : keys;
  const chords = parseSequence(primary);

  return (
    <>
      {chords.map((chord, chordIndex) => (
        <span key={`${chord}-${chordIndex}`} className="inline-flex items-center gap-1">
          {chordIndex > 0 && <span className="px-0.5 text-[10px] text-[#A1A4AC]">then</span>}
          {chordToLabelParts(chord).map((part, partIndex) => (
            <kbd key={`${part}-${partIndex}`}>{part}</kbd>
          ))}
        </span>
      ))}
    </>
  );
}
