// ============================================================================
// Shared UI - Select Component
// ============================================================================

import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  multiple?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  multiple = false,
  disabled = false,
  id,
  name,
  className = '',
  'aria-label': ariaLabel,
}) => {
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      multiple={multiple}
      disabled={disabled}
      className={`quant-field w-full appearance-none px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={ariaLabel}
      aria-disabled={disabled}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
};
