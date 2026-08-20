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
      className={`inline-flex items-baseline flex-row flex-nowrap whitespace-nowrap select-none font-normal tracking-tight ${size} ${className}`}
      style={{ fontFamily: 'var(--font-brand), cursive, sans-serif' }}
    >
      <span className="!inline !text-[#F4F5F7] !m-0 !p-0 !text-inherit !normal-case !tracking-tight">
        {meta.prefix}
      </span>
      <span className="!inline !text-[#FF7A00] !m-0 !p-0 !text-inherit !normal-case !tracking-tight ml-0.5">
        {meta.name}
      </span>
    </span>
  );
}

export default BrandWordmark;
