'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useShellChrome } from './ShellChromeContext';

/**
 * The one mobile create button.
 *
 * There were two of these. `AppShell` shipped a 48px flat-orange circle whose
 * glyph changed per route — upload arrow on Drive, person-plus on Contacts, a
 * bare `+` on CodeHub, a pencil everywhere else — and `calendar/page.tsx`
 * shipped a 56px gradient circle that opened a labelled column of four. Same
 * corner, same z-index, two different sizes, two different finishes, and a
 * route-prefix suppression list in the shell to stop them stacking.
 *
 * So the finish, the geometry, the offset above `MobileBottomNav` and the
 * open/close behaviour live here, once, and the glyph is always `+`. What a tap
 * *means* is carried by the accessible name and by the dial, not by a shape the
 * thumb has to identify at speed.
 *
 * One action collapses to a direct tap: a mail app that made Compose two taps
 * to look symmetrical with the calendar would be trading the most frequent
 * action in the product for tidiness. Two or more open the dial.
 */

export type FabTone = 'ember' | 'emerald' | 'rose';

export interface FabAction {
  /** Stable key. Also the `data-fab-action` hook QA drives the dial by. */
  id: string;
  /** Row text, and the trigger's accessible name when this is the only action. */
  label: string;
  /**
   * Inline SVG, sized by the caller. No emoji, no icon font. Only dial rows draw
   * one — a single action taps straight through the `+`, so it needs none.
   */
  icon?: ReactNode;
  tone?: FabTone;
  onSelect: () => void;
}

/*
 * Two ember rows arrived here with two different fills — `#2B1A11` on Task and
 * an off-palette `#2a1b10` on Event — which is a difference no one chose. Both
 * now use the Brand Soft token, and the hotter `#FFB875` type sits on it with
 * more value separation than `#FF8C42` did.
 */
const TONE: Record<FabTone, string> = {
  ember: 'bg-[#2B1A11]/90 hover:bg-[#2B1A11] text-[#FFB875] border-[#FF8C42]/50',
  emerald: 'bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border-emerald-500/50',
  rose: 'bg-rose-950/90 hover:bg-rose-900 text-rose-200 border-rose-500/50',
};

const ROW_CLASS =
  'flex w-max items-center gap-2.5 rounded-2xl border px-4 py-2.5 min-h-touch text-xs font-extrabold backdrop-blur-xl transition-all active:scale-95 shadow-[0_4px_16px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]';

export interface QuantFabProps {
  /** Empty renders nothing — that is how a route opts out. */
  actions: FabAction[];
  /** Trigger name in dial mode. Ignored when there is a single action. */
  label?: string;
}

export function QuantFab({ actions, label = 'Create' }: QuantFabProps) {
  const reduceMotion = useReducedMotion();
  const { isDrawerPresented } = useShellChrome();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = `${useId()}-fab-menu`;

  const isDial = actions.length > 1;

  const close = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  /*
   * Neither predecessor could be dismissed without hitting the trigger again:
   * no Escape, no outside press. On a phone that meant an open dial covered the
   * list it was floating over and the only way out was a 56px target.
   *
   * `isDrawerPresented` is in the guard as well as in the early return below,
   * because these listeners are `document`-level: leaving them mounted for the
   * frame between the drawer appearing and the reset effect flushing would let
   * the FAB's own Escape handler pull focus onto a trigger inside a subtree that
   * is `aria-hidden`, out of the drawer's `aria-modal` region.
   */
  useEffect(() => {
    if (!isOpen || isDrawerPresented) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isDrawerPresented, close]);

  /*
   * Returning `null` below does not unmount this component, so an open dial
   * would come back open once the drawer closed — with `rotate-45` still on a
   * trigger nobody had touched. Collapse it instead. `setIsOpen` rather than
   * `close(true)`: restoring focus here would drag it out of the drawer that
   * just took over.
   */
  useEffect(() => {
    if (isDrawerPresented) setIsOpen(false);
  }, [isDrawerPresented]);

  // WAI-ARIA menu button: opening moves focus in, so Escape has somewhere to send it back from.
  useEffect(() => {
    if (isOpen) rowsRef.current[0]?.focus();
  }, [isOpen]);

  /*
   * Two ways out, and both belong here rather than at the call sites. Empty
   * actions is how a route opts out. A presented drawer is modal: `AppShell`
   * used to guard only its own instance, so `/calendar`'s copy stayed hittable
   * over the backdrop — measured at 375x812 as `visibility: visible`,
   * `pointer-events: auto`, and `elementFromPoint(331, 704)` landing on the FAB
   * rather than on the drawer covering it.
   */
  if (actions.length === 0 || isDrawerPresented) return null;

  /*
   * The column is reversed so `actions[0]` lands nearest the thumb: the entry a
   * caller writes first is the one it most expects to be tapped, and on a phone
   * "most expected" and "closest to the trigger" have to be the same row.
   * Arrows therefore follow what the eye sees, not the array — Up climbs away
   * from the trigger, which is one index forward.
   */
  const focusRow = (index: number) => {
    const wrapped = (index + actions.length) % actions.length;
    rowsRef.current[wrapped]?.focus();
  };

  const onRowKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(index - 1);
    }
  };

  return (
    <div
      ref={rootRef}
      className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2.5 md:hidden"
    >
      <AnimatePresence>
        {isDial && isOpen && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 15, scale: 0.9 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="mb-1 flex flex-col-reverse items-end gap-2.5"
          >
            {actions.map((action, index) => (
              <button
                key={action.id}
                ref={(node) => {
                  rowsRef.current[index] = node;
                }}
                type="button"
                role="menuitem"
                data-fab-action={action.id}
                onClick={() => {
                  close(false);
                  action.onSelect();
                }}
                onKeyDown={(event) => onRowKeyDown(event, index)}
                className={`${ROW_CLASS} ${TONE[action.tone ?? 'ember']}`}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isDial ? setIsOpen((open) => !open) : actions[0]?.onSelect())}
        style={{
          background: 'linear-gradient(135deg, #FF9B5A 0%, #FF8C42 55%, #E8752F 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
        className={`flex size-14 items-center justify-center rounded-full font-black text-[#111111] transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C] ${
          isOpen ? 'rotate-45' : ''
        }`}
        aria-label={isDial ? label : (actions[0]?.label ?? label)}
        aria-haspopup={isDial ? 'menu' : undefined}
        aria-expanded={isDial ? isOpen : undefined}
        aria-controls={isDial && isOpen ? menuId : undefined}
      >
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
