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
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { chordToLabelParts, parseSequence } from '../lib/keyboard/chords';
import { COMMAND_GROUPS, type Command } from '../lib/keyboard/command-registry';
import { useCommandList, useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { IconX } from './icons';
import { useKeyboardSurfaces } from './KeyboardProvider';

const SCOPE = 'shortcuts-help';

interface HelpEntry {
  command: Command;
  available: boolean;
}

export function KeyboardShortcutsHelp() {
  const { isHelpOpen, closeHelp } = useKeyboardSurfaces();
  const commands = useCommandList();

  useKeyboardScope(SCOPE, { active: isHelpOpen, exclusive: true });
  useShortcut(['escape', '?'], closeHelp, { scope: SCOPE, disabled: !isHelpOpen });

  const groups = useMemo(() => {
    const byGroup = new Map<string, HelpEntry[]>();
    for (const command of commands) {
      if (!command.keys || command.hiddenInHelp) continue;
      const entry: HelpEntry = {
        command,
        available: !command.enabled || command.enabled(),
      };
      const existing = byGroup.get(command.group);
      if (existing) existing.push(entry);
      else byGroup.set(command.group, [entry]);
    }
    // Available bindings first within a section, so the dimmed contextual ones
    // collect at the bottom instead of interleaving with what works right now.
    for (const entries of byGroup.values()) {
      entries.sort((a, b) => Number(b.available) - Number(a.available));
    }
    return COMMAND_GROUPS.filter((group) => byGroup.has(group)).map((group) => ({
      group,
      items: byGroup.get(group)!,
    }));
  }, [commands]);

  const hasContextual = groups.some(({ items }) => items.some((item) => !item.available));

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
          role="dialog"
          aria-label="Keyboard shortcuts"
          aria-modal="true"
        >
          <motion.div
            className="shortcuts-panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shortcuts-header">
              <h2>Keyboard shortcuts</h2>
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
                  <h3>{group}</h3>
                  <ul>
                    {items.map(({ command, available }) => (
                      <li key={command.id} className={available ? undefined : 'is-unavailable'}>
                        <span className="shortcut-desc">{command.label}</span>
                        <span className="shortcut-keys">
                          <BindingKeys keys={command.keys!} />
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
                {hasContextual && ' · dimmed keys need a focused conversation'}
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
