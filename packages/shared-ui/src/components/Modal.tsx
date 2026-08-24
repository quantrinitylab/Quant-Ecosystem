'use client';
// ============================================================================
// Shared UI - Modal Component
// Themed with Quant design tokens (works in dark + light), premium surface,
// responsive: centered dialog on desktop, bottom sheet on small screens.
// ============================================================================

import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

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

const SURFACE = 'var(--quant-popover, var(--quant-surface-elevated, #17171d))';
const FOREGROUND = 'var(--quant-popover-foreground, var(--quant-foreground, #f5f3f7))';
const BORDER = 'var(--quant-border, rgba(255,255,255,.12))';
const MUTED = 'var(--quant-muted-foreground, #9b99a6)';
const RADIUS = 'calc(var(--quant-radius, 0.625rem) * 1.6)';
const SHADOW = 'var(--quant-shadow-xl, 0 32px 90px rgba(0,0,0,.52))';

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
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <style>{`@keyframes quantModalIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
.quant-modal-panel{animation:quantModalIn .18s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.quant-modal-panel{animation:none}}`}</style>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(4,4,6,.66)', backdropFilter: 'blur(6px)' }}
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
          backgroundImage:
            'radial-gradient(120% 80% at 50% -20%, rgba(255,255,255,.07), transparent 60%)',
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)',
          }}
        />
        {(title || showCloseButton) && (
          <div
            className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div className="min-w-0">
              {title && (
                <h2 id="modal-title" className="truncate text-base font-semibold tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors"
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
