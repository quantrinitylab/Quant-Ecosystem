'use client';
// ============================================================================
// Shared UI - Modal Component
// Themed with Quant design tokens (works in dark + light), premium surface,
// responsive: centered dialog on desktop, bottom sheet on small screens.
// ============================================================================

import React, { useEffect, useCallback, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  className?: string;
}

const SURFACE = 'var(--quant-popover, #16181D)';
const FOREGROUND = 'var(--quant-popover-foreground, #F5F5F5)';
const BORDER = 'var(--quant-border, #282C35)';
const MUTED = 'var(--quant-muted-foreground, #A1A4AC)';
const RADIUS = '0.75rem';
const SHADOW = 'var(--quant-shadow-xl, 0 24px 64px rgba(0,0,0,.6))';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  footer,
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);

  // `id="modal-title"` was hardcoded, which is a duplicate-id collision waiting
  // to happen in a shared primitive — and the confirmation dialogs in QuantMail
  // do open over an already-open Modal. `useId` also gives the `description`
  // prop somewhere to point: it was rendered but wired to nothing, so a screen
  // reader announced the title and then went straight to the body.
  const labelId = useId();
  const descriptionId = useId();

  /**
   * Tab used to walk straight out of the dialog into the page behind it — on an
   * `aria-modal="true"` surface, which tells assistive tech the rest of the
   * document does not exist. The trap also returns focus to whatever opened the
   * modal, which nothing here did before.
   *
   * Gated on `mounted` as well as `isOpen`: the portal does not render on the
   * first pass, so a modal that starts open would otherwise activate the trap
   * on a frame where the container ref is still null.
   *
   * Escape stays on this component's own listener rather than moving into the
   * hook — `closeOnEscape` is part of Modal's contract, and leaving dismissal
   * here keeps one owner for it.
   */
  const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen && mounted });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Only the instance that took the lock releases it. This used to run on
      // every closed Modal's cleanup too, so a closed one unlocked body scroll
      // that another open surface was still holding.
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const sizeStyles: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-5xl',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? labelId : undefined}
      aria-describedby={description ? descriptionId : undefined}
    >
      <style>{`@keyframes quantModalIn{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
.quant-modal-panel{animation:quantModalIn .16s cubic-bezier(.16,1,.3,1) both}
@media (prefers-reduced-motion:reduce){.quant-modal-panel{animation:none}}`}</style>
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={`quant-modal-panel relative w-full ${sizeStyles[size]} flex max-h-[88vh] flex-col overflow-hidden ${className}`}
        style={{
          background: SURFACE,
          color: FOREGROUND,
          border: `1px solid ${BORDER}`,
          borderRadius: RADIUS,
          boxShadow: SHADOW,
        }}
      >
        {(title || showCloseButton) && (
          <div
            className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div className="min-w-0">
              {title && (
                <h2 id={labelId} className="truncate text-base font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: MUTED }}
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] [@media(pointer:coarse)]:size-11"
                style={{ color: MUTED, border: `1px solid ${BORDER}` }}
                aria-label="Close modal"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer && (
          <div
            className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6"
            style={{ borderTop: `1px solid ${BORDER}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(modalContent, document.body);
};
