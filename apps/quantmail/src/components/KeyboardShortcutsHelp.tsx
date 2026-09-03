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
 * What to list, in what order, and why a row is dim now live in
 * `lib/keyboard/help-model.ts`, because Settings › Keyboard renders the same
 * reference and a second copy of those rules is how the old table came to
 * disagree with the engine. This file owns the modal: the scope, the focus trap,
 * the animation and the three-column layout.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useId, useMemo } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import { buildHelpGroups, dimNoteFor, helpGroupHeading } from '../lib/keyboard/help-model';
import { useCommandList, useKeyboardScope, useShortcut } from '../lib/keyboard/hooks';
import { IconX } from './icons';
import { useKeyboardSurfaces } from './KeyboardProvider';
import { ShortcutKeys } from './ShortcutKeys';

const SCOPE = 'shortcuts-help';

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

  const groups = useMemo(() => buildHelpGroups(commands), [commands]);
  const dimNote = dimNoteFor(groups, {
    elsewhere: ' · dimmed keys apply to the inbox',
    contextual: ' · dimmed keys need a focused conversation',
  });

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
                  <h3>{helpGroupHeading(group)}</h3>
                  <ul>
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className={`shortcut-row${item.available ? '' : ' is-unavailable'}`}
                      >
                        <span className="shortcut-desc">{item.label}</span>
                        <span className="shortcut-keys">
                          <ShortcutKeys keys={item.keys} />
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
