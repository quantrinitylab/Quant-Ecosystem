'use client';

// ============================================================================
// QuantMail — "More apps" overflow menu (shared by both switcher surfaces)
// ============================================================================
// One deliberate, user-triggered entry point to the sibling ecosystem apps
// (QuantChat, QuantAI). Replaces the phantom "More from QUANTRINITY" panel
// from the 2026-10-11 audit, which appeared spontaneously with no
// reproducible trigger — this menu opens ONLY on an explicit tap/click of the
// grid button, and closes on: the same button, Esc, backdrop tap, or scroll.
//
// The panel is `position: fixed` (measured from the trigger button) so it
// escapes overflow-clipped ancestors such as the mobile header's
// grid-rows collapse wrapper. Focus returns to the trigger on close.
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EcosystemAppsPanel } from './EcosystemAppsPanel';

export type MoreAppsAlign = 'left' | 'below';

export interface MoreAppsMenuProps {
  /** Where the panel opens relative to the trigger button. */
  align: MoreAppsAlign;
  /** Styling for the grid trigger button (surface-specific). */
  buttonClassName?: string;
  buttonTestId?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

function GridGlyph() {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </svg>
  );
}

const PANEL_WIDTH = 256; // w-64
const PANEL_GAP = 10;

interface Anchor {
  top: number;
  left?: number;
  right?: number;
}

export function MoreAppsMenu({
  align,
  buttonClassName = '',
  buttonTestId = 'more-apps-menu-button',
  ariaLabel = 'More Quant apps — open QuantChat or QuantAI',
  title = 'More Quant apps',
  className = '',
}: MoreAppsMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
    // Return focus to the trigger so keyboard/screen-reader users land back
    // where they opened the menu.
    buttonRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect && typeof window !== 'undefined') {
      if (align === 'below') {
        // Below the trigger, right-aligned with it (mobile top bar).
        setAnchor({
          top: rect.bottom + PANEL_GAP,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      } else {
        // To the left of the trigger, top-aligned with it (desktop rail).
        setAnchor({
          top: Math.max(8, rect.top),
          left: Math.max(8, rect.left - PANEL_WIDTH - PANEL_GAP),
        });
      }
    }
    setOpen(true);
  }, [open, close, align]);

  // Esc closes; a scroll (capture) closes too so a fixed panel never drifts
  // away from its trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = () => close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open, close]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={buttonTestId}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={buttonClassName}
      >
        <GridGlyph />
      </button>
      {open && (
        <>
          <div
            data-testid="more-apps-backdrop"
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            data-testid="more-apps-panel-anchor"
            className="fixed z-50"
            style={
              anchor
                ? { top: anchor.top, left: anchor.left, right: anchor.right }
                : undefined
            }
          >
            <EcosystemAppsPanel />
          </div>
        </>
      )}
    </div>
  );
}

export default MoreAppsMenu;
