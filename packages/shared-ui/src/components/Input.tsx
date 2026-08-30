// ============================================================================
// Shared UI - Input Component
// ============================================================================

import React, { forwardRef } from 'react';

export interface InputProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email' | 'url' | 'search' | 'decimal' | 'none';
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  'aria-label'?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type = 'text',
      value,
      defaultValue,
      placeholder,
      label,
      helperText,
      error,
      disabled = false,
      readOnly = false,
      required = false,
      fullWidth = false,
      size = 'md',
      icon,
      iconPosition = 'left',
      className = '',
      id,
      name,
      autoComplete,
      maxLength,
      inputMode,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const inputId = id || `input-${name || Math.random().toString(36).substring(2, 8)}`;

    /**
     * Every size keeps a 44px floor until `sm`, then drops to its designed
     * height. A phone measured `sm`/`md` fields at 32px and 36px, which is under
     * the touch minimum for the whole suite at once — these classes are the only
     * place the height of an `input-*` field is decided.
     */
    const sizeStyles: Record<string, string> = {
      sm: 'h-11 sm:h-8 px-2.5 text-xs',
      md: 'h-11 sm:h-9 px-3 text-sm',
      lg: 'h-11 px-4 text-base',
    };

    const baseInputStyles =
      'block rounded-lg border bg-[#111318] text-[#F5F5F5] placeholder-[#A1A4AC] transition-colors duration-150 focus:outline-none focus:border-[#FF8C42] focus:ring-2 focus:ring-[#FF8C42]/20';
    const normalStyles = 'border-[#282C35] hover:border-[#3A404D]';
    const errorStyles =
      'border-[#EF4444] text-[#F87171] focus:border-[#EF4444] focus:ring-[#EF4444]/20';
    const disabledStyles = 'opacity-50 cursor-not-allowed bg-[#16181D]';

    const inputClassName = [
      baseInputStyles,
      sizeStyles[size],
      error ? errorStyles : normalStyles,
      disabled ? disabledStyles : '',
      fullWidth ? 'w-full' : '',
      icon && iconPosition === 'left' ? 'pl-9' : '',
      icon && iconPosition === 'right' ? 'pr-9' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`input-wrapper ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-[#A1A4AC]">
            {label}
            {required && <span className="text-[#EF4444] ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 transform pointer-events-none text-[#6B6E76]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            name={name}
            type={type}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            maxLength={maxLength}
            inputMode={inputMode}
            autoComplete={autoComplete}
            className={inputClassName}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
          />
          {icon && iconPosition === 'right' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 transform pointer-events-none text-[#6B6E76]">
              {icon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-[#F87171]">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="mt-1 text-xs text-[#A1A4AC]">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
