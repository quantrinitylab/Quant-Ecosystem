'use client';

// ============================================================================
// Shared UI - Button Component
// ============================================================================

import React from 'react';
import { useReducedMotion } from 'framer-motion';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  'aria-label'?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  type = 'button',
  className = '',
  onClick,
  'aria-label': ariaLabel,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#090A0C] active:scale-[0.98] select-none';

  const variantStyles: Record<string, string> = {
    primary:
      'bg-[#FF8C42] text-[#111111] font-semibold hover:bg-[#FF9B5A] active:bg-[#E8752F] shadow-sm',
    secondary:
      'bg-[#16181D] text-[#F5F5F5] border border-[#282C35] hover:bg-[#1C1F26] hover:border-[#3A404D] active:bg-[#111318]',
    ghost:
      'bg-transparent text-[#A1A4AC] hover:text-[#F5F5F5] hover:bg-white/[0.06] active:bg-white/[0.09]',
    danger:
      'bg-[#2A1215] text-[#F87171] border border-[#4E1F24] hover:bg-[#38181C] hover:text-[#FFA3A3] active:bg-[#200E10]',
    success:
      'bg-[#0E2A1A] text-[#4ADE80] border border-[#1B4D2E] hover:bg-[#133823] active:bg-[#081B10]',
  };

  /*
   * The heights are pointer heights: 28, 36 and 40px all fall under the 44px a
   * finger needs, and this is the button every app in the workspace reaches for.
   * `min-h`/`min-w` beat `h` in the box calculation, so the touch floor applies
   * below `sm` and the compact height comes back at 640px and up where a mouse is
   * the likely input. `xl` is already 48px.
   *
   * Arbitrary values rather than the `min-h-touch` token: only three of the
   * fourteen app Tailwind configs define that theme key, and this component is
   * compiled by all of them.
   */
  const TOUCH_FLOOR = 'min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0';

  const sizeStyles: Record<string, string> = {
    sm: `h-7 px-2.5 text-xs gap-1.5 ${TOUCH_FLOOR}`,
    md: `h-9 px-3.5 text-sm gap-2 ${TOUCH_FLOOR}`,
    lg: `h-10 px-4 text-sm font-semibold gap-2.5 ${TOUCH_FLOOR}`,
    xl: 'h-12 px-6 text-base font-semibold gap-3',
  };

  const disabledStyles = 'opacity-50 cursor-not-allowed pointer-events-none';
  const fullWidthStyles = fullWidth ? 'w-full' : '';

  const combinedClassName = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    disabled || loading ? disabledStyles : '',
    fullWidthStyles,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={combinedClassName}
      disabled={disabled || loading}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      {loading && (
        <span
          className={`h-4 w-4 border-2 border-current border-t-transparent rounded-full${prefersReducedMotion ? '' : ' animate-spin'}`}
        />
      )}
      {!loading && icon && iconPosition === 'left' && <span className="btn-icon">{icon}</span>}
      <span>{children}</span>
      {!loading && icon && iconPosition === 'right' && <span className="btn-icon">{icon}</span>}
    </button>
  );
};
