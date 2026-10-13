'use client';

// ============================================================================
// Choose your Quanty — the avatar picker (Quant Workplace).
// ============================================================================
// Mounted once by AppShell. Any surface opens it with
// `openQuantyAvatarPicker()` (the desktop sidebar's Quanty card, the avatar in
// the Quanty drawer header). Bottom sheet on phones, centred dialog from 768px.
//
// The picker keeps its own focus loop on `window` in the capture phase, ahead
// of any `document`-level trap: it can open on top of the Quanty drawer, whose
// trap would otherwise pull Tab back into the drawer and close the drawer on
// Escape instead of the picker.
//
// "Create your own" is shown, disabled and labelled "coming soon" — the
// avatar studio does not exist yet, and a button that pretends it does would
// be a fake success.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { BubbleAvatar } from '@quant/shared-ui';
import {
  QUANTY_AVATARS,
  QUANTY_AVATAR_PICKER_EVENT,
  getQuantyAvatar,
  setQuantyAvatarId,
  useQuantyAvatar,
  type QuantyAvatarId,
  type QuantyAvatarOption,
} from '../../lib/quanty/avatar-choice';
import { showToast } from '../../lib/toast-bus';

/** Thumbnail for the grid; the classic ghost uses its static render here. */
function thumbFor(a: QuantyAvatarOption): string {
  return a.src ?? '/quanty-ghost-512.webp';
}

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function QuantyAvatarPicker() {
  const current = useQuantyAvatar();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<QuantyAvatarId>(current.id);
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const onOpen = () => {
      restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending(current.id);
      setOpen(true);
    };
    window.addEventListener(QUANTY_AVATAR_PICKER_EVENT, onOpen);
    return () => window.removeEventListener(QUANTY_AVATAR_PICKER_EVENT, onOpen);
  }, [current.id]);

  const close = useCallback(() => {
    setOpen(false);
    const back = restoreRef.current;
    restoreRef.current = null;
    if (back && document.contains(back)) requestAnimationFrame(() => back.focus());
  }, []);

  // Initial focus on the checked portrait, then a self-contained focus loop.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!panelRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      e.stopPropagation();
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!active || !panelRef.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  const confirm = () => {
    const chosen = getQuantyAvatar(pending);
    const changed = chosen.id !== current.id;
    setQuantyAvatarId(chosen.id);
    close();
    if (changed) showToast({ text: `Quanty is now ${chosen.name}`, type: 'success', subject: 'quanty-avatar' });
  };

  // Arrow keys move the choice inside the radio group (roving tabindex).
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = QUANTY_AVATARS.findIndex((a) => a.id === pending);
    const next = QUANTY_AVATARS[(i + step + QUANTY_AVATARS.length) % QUANTY_AVATARS.length]!;
    setPending(next.id);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>(`[data-avatar-option="${next.id}"]`)?.focus(),
    );
  };

  if (!open) return null;
  const shown = getQuantyAvatar(pending);

  return (
    <>
      <div className="qw-pick-scrim" onClick={close} aria-hidden="true" />
      <section
        ref={panelRef}
        className="qw-pick"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="quanty-avatar-picker"
      >
        <div className="qw-pick-grab" aria-hidden="true" />
        <button type="button" className="qw-pick-x" onClick={close} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="qw-pick-hero">
          <span className="qw-pick-hero-av" style={{ ['--av' as string]: shown.color }} aria-hidden="true">
            {shown.src ? (
              <img key={shown.id} src={shown.src} alt="" width={84} height={84} draggable={false} />
            ) : (
              <BubbleAvatar key={shown.id} state="recognize" size={84} label="" />
            )}
          </span>
          <div className="qw-pick-hero-text">
            <h2 id={titleId}>Choose your Quanty</h2>
            <p>
              Your AI teammate across Mail, Calendar, Drive, Contacts and Git. Now: <b>{shown.name}</b>
            </p>
          </div>
        </div>

        <div className="qw-pick-grid" role="radiogroup" aria-labelledby={titleId} onKeyDown={onGridKey}>
          {QUANTY_AVATARS.map((a) => {
            const checked = a.id === pending;
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-avatar-option={a.id}
                className="qw-av"
                style={{ ['--av' as string]: a.color }}
                onClick={() => setPending(a.id)}
              >
                <span className="qw-av-ring">
                  <img src={thumbFor(a)} alt="" width={62} height={62} draggable={false} loading="lazy" decoding="async" />
                </span>
                <span className="qw-av-chk" aria-hidden="true">
                  <CheckIcon />
                </span>
                {a.name}
                <small>{a.vibe}</small>
              </button>
            );
          })}
          <button type="button" className="qw-av qw-av-make" disabled aria-label="Create your own Quanty — coming soon">
            <span className="qw-av-ring">
              <PlusIcon />
            </span>
            Create
            <small>coming soon</small>
          </button>
        </div>

        <button type="button" className="qw-pick-cta" onClick={confirm} data-testid="quanty-avatar-confirm">
          {pending === current.id ? `Keep ${shown.name}` : `Use ${shown.name}`}
        </button>
      </section>
    </>
  );
}

export default QuantyAvatarPicker;
