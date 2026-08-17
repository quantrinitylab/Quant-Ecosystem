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

    const sizeStyles: Record<string, string> = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-5 py-3 text-lg',
    };

    const baseInputStyles =
      'block rounded-lg border transition-colors duration-200 focus:outline-none focus:ring-2';
    const normalStyles = 'quant-field';
    const errorStyles = 'quant-field quant-field-error';
    const disabledStyles = 'opacity-60 cursor-not-allowed';

    const inputClassName = [
      baseInputStyles,
      sizeStyles[size],
      error ? errorStyles : normalStyles,
      disabled ? disabledStyles : '',
      fullWidth ? 'w-full' : '',
      icon && iconPosition === 'left' ? 'pl-10' : '',
      icon && iconPosition === 'right' ? 'pr-10' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`input-wrapper ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium"
            style={{ color: 'var(--quant-foreground, #f5f3f7)' }}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 transform"
              style={{ color: 'var(--quant-muted-foreground, #9b99a6)' }}
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            name={name}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            autoComplete={autoComplete}
            maxLength={maxLength}
            inputMode={inputMode}
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
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 transform"
              style={{ color: 'var(--quant-muted-foreground, #9b99a6)' }}
            >
              {icon}
            </span>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-1 text-sm"
            style={{ color: 'var(--quant-destructive, #f87171)' }}
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${inputId}-helper`} className="mt-1 text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
