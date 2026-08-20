'use client';

export type BrandWordmarkProps = {
  app?: 'mail' | 'calendar' | 'drive' | 'contacts' | 'code';
  size?: string;
  className?: string;
};

const APP_META = {
  mail: { prefix: 'Quant', name: 'Mail' },
  calendar: { prefix: 'Quant', name: 'Calendar' },
  drive: { prefix: 'Quant', name: 'Drive' },
  contacts: { prefix: 'Quant', name: 'Contacts' },
  code: { prefix: 'Quant', name: 'Code' },
};

/**
 * Instagram-Style Cursive Script Brand Wordmark for Quant Ecosystem.
 */
export function BrandWordmark({
  app = 'mail',
  size = 'text-lg',
  className = '',
}: BrandWordmarkProps) {
  const meta = APP_META[app] || APP_META.mail;

  return (
    <span
      className={`inline-flex items-baseline select-none font-normal tracking-tight ${size} ${className}`}
      style={{ fontFamily: 'var(--font-brand), cursive, sans-serif' }}
    >
      <span className="text-[#F4F5F7]">{meta.prefix}</span>
      <span className="text-[#FF7A00] ml-0.5">{meta.name}</span>
    </span>
  );
}

export default BrandWordmark;
