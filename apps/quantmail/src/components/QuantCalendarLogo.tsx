'use client';

import { AppMark, MARK_VOID, type QuantLogoProps } from './AppMark';

/**
 * QuantCalendar's mark. The page is knocked out of the brand plate and only the
 * header rail and the current-day block are painted back in — a filled two-tone
 * shape survives the 16px sidebar rail, which the 1.8-weight outline grid this
 * replaced did not.
 */
export function QuantCalendarLogo({
  size = 32,
  className = '',
  title = 'QuantCalendar',
}: QuantLogoProps) {
  return (
    <AppMark size={size} className={className} title={title}>
      {(brand) => (
        <>
          {/* Binding tabs first so the header rail crops them, as on a real pad. */}
          <rect x="11.4" y="5.8" width="1.8" height="4.4" rx="0.9" fill={MARK_VOID} />
          <rect x="18.8" y="5.8" width="1.8" height="4.4" rx="0.9" fill={MARK_VOID} />
          <rect x="7.2" y="9" width="17.6" height="14.6" rx="2.6" fill={MARK_VOID} />
          <path
            d="M9.8 9H22.2A2.6 2.6 0 0 1 24.8 11.6V12.6H7.2V11.6A2.6 2.6 0 0 1 9.8 9Z"
            fill={brand}
          />
          <rect x="13.9" y="15.8" width="4.2" height="4.2" rx="1.1" fill={brand} />
        </>
      )}
    </AppMark>
  );
}

export default QuantCalendarLogo;
