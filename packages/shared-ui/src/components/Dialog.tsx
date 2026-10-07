'use client';

// ============================================================================
// Shared UI - Dialog Component
// ============================================================================

import React, { useId } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  'aria-label'?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const titleId = useId();

  /**
   * This used to be forty lines of hand-rolled trap, and three things were wrong
   * with it that the shared hook does not get wrong:
   *
   * - Its focusable query took `button, input, …` unfiltered, so a disabled or
   *   hidden control could be the wrap target — Tab then landed on something
   *   that cannot hold focus and fell out of the dialog entirely.
   * - It re-captured `previousFocusRef` on every effect run, and the effect
   *   depended on `handleKeyDown`, which changes identity whenever the caller
   *   re-renders. So while the dialog was open the "return here" target got
   *   overwritten with an element *inside* the dialog, and closing dropped focus
   *   to `<body>`.
   * - Focus parked outside the dialog (a portalled child, a stray click on the
   *   backdrop) could never get back in: neither wrap branch matched, so Tab
   *   walked the page behind an `aria-modal="true"` surface.
   *
   * Escape moves to the hook too — Dialog has no `closeOnEscape` opt-out to
   * honour, and the hook's handler stops propagation, which is what keeps a
   * confirmation dialog from also dismissing the dialog underneath it.
   */
  const dialogRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose });

  const sizeStyles: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || 'Dialog'}
        aria-labelledby={title ? titleId : undefined}
        className={`relative z-10 w-full ${sizeStyles[size]} bg-[#16181D] border border-[#282C35] text-[#F5F5F5] rounded-xl shadow-2xl p-6 mx-4 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#282C35]">
            <h2 id={titleId} className="text-base font-semibold text-[#F5F5F5]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F5F5F5] hover:bg-white/5 transition-colors focus:outline-none focus:ring-1 focus:ring-[#FF8C42]"
              aria-label="Close dialog"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
