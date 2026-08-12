// ============================================================================
// Shared UI - FormField Component
// ============================================================================

import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  hint,
  required = false,
  children,
  htmlFor,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium" style={{ color: 'var(--quant-foreground, #f5f3f7)' }}>
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p className="text-xs" style={{ color: 'var(--quant-muted-foreground, #9b99a6)' }} role="note">
          {hint}
        </p>
      )}

      {error && (
        <p className="text-xs" style={{ color: 'var(--quant-destructive, #f87171)' }} role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
};
