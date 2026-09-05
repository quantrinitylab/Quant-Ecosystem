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
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium"
        style={{ color: 'var(--quant-foreground, #f5f3f7)' }}
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p
          className="text-xs"
          style={{ color: 'var(--quant-muted-foreground, #9b99a6)' }}
          role="note"
        >
          {hint}
        </p>
      )}

      {/*
        Mounted on every render, not only when `error` is set. A live region has
        to exist and be quiet before it can speak: a `role="alert"` node inserted
        at the same instant it first has text is the case screen readers most
        often miss entirely, and since this is the package's shared field
        wrapper, every form built on it lost validation announcements the same
        way. `sr-only` is `position: absolute`, so an empty region costs no
        layout in the `flex-col gap-1.5` — which is why this can be one element
        rather than a hidden announcer shadowing a visible copy.

        The id is derived from `htmlFor` so a caller can point its input's
        `aria-describedby` at `${htmlFor}-error` and have the message reachable
        on focus too, not only at the moment it changes. FormField cannot set
        that itself without cloning `children`.
      */}
      <p
        className={error ? 'text-xs' : 'sr-only'}
        style={error ? { color: 'var(--quant-destructive, #f87171)' } : undefined}
        role="alert"
        id={htmlFor ? `${htmlFor}-error` : undefined}
      >
        {error ?? ''}
      </p>
    </div>
  );
};
