// ============================================================================
// Shared UI - Card Component
// ============================================================================

import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  clickable?: boolean;
  className?: string;
  onClick?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  media?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  padding = 'md',
  hoverable = false,
  clickable = false,
  className = '',
  onClick,
  header,
  footer,
  media,
}) => {
  const variantStyles: Record<string, string> = {
    elevated: 'bg-[#16181D] border border-[#282C35] text-[#F5F5F5] shadow-sm',
    outlined: 'bg-[#111318] border border-[#282C35] text-[#F5F5F5]',
    flat: 'bg-[#111318] text-[#F5F5F5]',
  };

  const paddingStyles: Record<string, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const hoverStyles = hoverable
    ? 'hover:border-[#3A404D] hover:bg-[#1C1F26] transition-all duration-150'
    : '';
  const clickStyles =
    clickable || onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : '';

  return (
    <div
      className={`rounded-xl overflow-hidden ${variantStyles[variant]} ${hoverStyles} ${clickStyles} ${className}`}
      onClick={onClick}
      role={clickable || onClick ? 'button' : undefined}
      tabIndex={clickable || onClick ? 0 : undefined}
    >
      {media && <div className="card-media">{media}</div>}
      {header && <div className="px-4 py-3 border-b border-[#282C35]">{header}</div>}
      <div className={paddingStyles[padding]}>{children}</div>
      {footer && <div className="px-4 py-3 border-t border-[#282C35]">{footer}</div>}
    </div>
  );
};
