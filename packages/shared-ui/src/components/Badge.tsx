// ============================================================================
// Shared UI - Badge Component
// ============================================================================

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  rounded?: boolean;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  rounded = false,
  dot = false,
  removable = false,
  onRemove,
  className = '',
}) => {
  const variantStyles: Record<string, string> = {
    default: 'bg-[#16181D] text-[#A1A4AC] border border-[#282C35]',
    primary: 'bg-[#2B1A11] text-[#FF9B5A] border border-[#5C3016]',
    success: 'bg-[#0E2A1A] text-[#4ADE80] border border-[#1B4D2E]',
    warning: 'bg-[#2C200C] text-[#FCD34D] border border-[#543D15]',
    danger: 'bg-[#2A1215] text-[#F87171] border border-[#4E1F24]',
    info: 'bg-[#0F1D33] text-[#60A5FA] border border-[#1E3A66]',
  };

  const sizeStyles: Record<string, string> = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-xs font-medium gap-1.5',
    lg: 'px-3 py-1 text-sm font-medium gap-1.5',
  };

  const dotColors: Record<string, string> = {
    default: 'bg-[#6B6E76]',
    primary: 'bg-[#FF8C42]',
    success: 'bg-[#22C55E]',
    warning: 'bg-[#F59E0B]',
    danger: 'bg-[#EF4444]',
    info: 'bg-[#3B82F6]',
  };

  const roundedStyles = rounded ? 'rounded-full' : 'rounded-md';

  return (
    <span
      className={`inline-flex items-center font-medium transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${roundedStyles} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      <span>{children}</span>
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 -mr-1 p-0.5 rounded-full opacity-60 hover:opacity-100 hover:bg-white/10 transition-opacity focus:outline-none"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
};
