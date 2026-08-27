'use client';

import React from 'react';

export type BrandWordmarkProps = {
  app?: 'mail' | 'calendar' | 'drive' | 'contacts' | 'code';
  size?: 'text-sm' | 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl' | 'text-4xl';
  className?: string;
};

const APP_TITLES: Record<string, { brand: string; name: string }> = {
  mail: { brand: 'Quant', name: 'Mail' },
  calendar: { brand: 'Quant', name: 'Calendar' },
  drive: { brand: 'Quant', name: 'Drive' },
  contacts: { brand: 'Quant', name: 'Contacts' },
  code: { brand: 'Quant', name: 'Code' },
};

/**
 * World-Class Instagram-Style Signature Wordmark
 */
export function BrandWordmark({
  app = 'mail',
  size = 'text-xl',
  className = '',
}: BrandWordmarkProps) {
  const item = APP_TITLES[app] || APP_TITLES.mail;

  const fontSizes = {
    'text-sm': 'text-[14px]',
    'text-base': 'text-[16px]',
    'text-lg': 'text-[18px]',
    'text-xl': 'text-[20px]',
    'text-2xl': 'text-[24px]',
    'text-4xl': 'text-[36px]',
  };

  const chosenSize = fontSizes[size] || 'text-[20px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap select-none font-semibold tracking-tight ${chosenSize} ${className}`}
    >
      <span className="text-[#F5F5F5] font-bold tracking-tight">{item.brand}</span>
      <span className="text-[#FF8C42] font-semibold tracking-tight">{item.name}</span>
    </span>
  );
}

export default BrandWordmark;
