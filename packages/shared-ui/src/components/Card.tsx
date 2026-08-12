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
    elevated: 'quant-panel quant-panel-elevated',
    outlined: 'quant-panel',
    flat: 'quant-panel quant-panel-flat',
  };

  const paddingStyles: Record<string, string> = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const hoverStyles = hoverable ? 'hover:shadow-lg transition-shadow duration-200' : '';
  const clickStyles = clickable || onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : '';

  return (
    <div
      className={`rounded-xl overflow-hidden ${variantStyles[variant]} ${hoverStyles} ${clickStyles} ${className}`}
      onClick={onClick}
      role={clickable || onClick ? 'button' : undefined}
      tabIndex={clickable || onClick ? 0 : undefined}
    >
      {media && <div className="card-media">{media}</div>}
      {header && <div className="px-4 py-3 border-b border-[var(--quant-border,rgba(255,255,255,.1))]">{header}</div>}
      <div className={paddingStyles[padding]}>{children}</div>
      {footer && <div className="px-4 py-3 border-t border-[var(--quant-border,rgba(255,255,255,.1))]">{footer}</div>}
    </div>
  );
};
