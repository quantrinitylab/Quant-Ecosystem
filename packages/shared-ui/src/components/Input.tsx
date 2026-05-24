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
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  'aria-label'?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
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
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  'aria-label': ariaLabel,
}, ref) => {
  const inputId = id || `input-${name || Math.random().toString(36).substring(2, 8)}`;

  const sizeStyles: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-5 py-3 text-lg',
  };

  const baseInputStyles = 'block rounded-lg border transition-colors duration-200 focus:outline-none focus:ring-2';
  const normalStyles = 'border-gray-300 focus:border-blue-500 focus:ring-blue-200';
  const errorStyles = 'border-red-500 focus:border-red-500 focus:ring-red-200';
  const disabledStyles = 'bg-gray-100 text-gray-500 cursor-not-allowed';

  const inputClassName = [
    baseInputStyles,
    sizeStyles[size],
    error ? errorStyles : normalStyles,
    disabled ? disabledStyles : '',
    fullWidth ? 'w-full' : '',
    icon && iconPosition === 'left' ? 'pl-10' : '',
    icon && iconPosition === 'right' ? 'pr-10' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={`input-wrapper ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && iconPosition === 'left' && (
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
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
          className={inputClassName}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        />
        {icon && iconPosition === 'right' && (
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {icon}
          </span>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600" role="alert">
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
});

Input.displayName = 'Input';
