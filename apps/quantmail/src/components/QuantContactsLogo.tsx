'use client';

import { AppMark, MARK_VOID, type QuantLogoProps } from './AppMark';

/**
 * QuantContacts' mark: a contact card, not a bare avatar. The two detail lines are
 * what separate "a person" from "a person's record", and they are also what keeps
 * this distinguishable from the sender avatars used throughout the inbox.
 */
export function QuantContactsLogo({
  size = 32,
  className = '',
  title = 'QuantContacts',
}: QuantLogoProps) {
  return (
    <AppMark size={size} className={className} title={title}>
      {(brand) => (
        <>
          <rect x="6.6" y="8.6" width="18.8" height="14.8" rx="2.8" fill={MARK_VOID} />
          <circle cx="12.6" cy="14.6" r="2.35" fill={brand} />
          <path
            d="M8.9 21.4C8.9 18.9 10.6 17.6 12.6 17.6C14.6 17.6 16.3 18.9 16.3 21.4Z"
            fill={brand}
          />
          <rect x="18.2" y="13.6" width="5.4" height="1.5" rx="0.75" fill={brand} />
          <rect x="18.2" y="17" width="4" height="1.5" rx="0.75" fill={brand} />
        </>
      )}
    </AppMark>
  );
}

export default QuantContactsLogo;
