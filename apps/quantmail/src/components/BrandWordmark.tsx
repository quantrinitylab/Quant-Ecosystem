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
    'text-sm': 'text-[15px]',
    'text-base': 'text-[18px]',
    'text-lg': 'text-[22px]',
    'text-xl': 'text-[26px]',
    'text-2xl': 'text-[32px]',
    'text-4xl': 'text-[44px]',
  };

  const chosenSize = fontSizes[size] || 'text-[24px]';

  return (
    <span
      className={`inline-flex items-baseline flex-nowrap whitespace-nowrap select-none tracking-normal ${chosenSize} ${className}`}
      style={{
        fontFamily: '"Billabong", "Grand Hotel", "Brush Script MT", cursive, sans-serif',
        fontStyle: 'italic',
        lineHeight: 1.1,
      }}
    >
      <span className="text-[#F8FAFC] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] font-medium">
        {item.brand}
      </span>
      <span className="bg-gradient-to-r from-[#FF7A00] via-[#FFA726] to-[#FFD54F] bg-clip-text text-transparent ml-0.5 font-semibold drop-shadow-[0_2px_8px_rgba(255,122,0,0.4)]">
        {item.name}
      </span>
    </span>
  );
}

export default BrandWordmark;
