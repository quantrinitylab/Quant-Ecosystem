'use client';

import { AppMark, MARK_VOID, type QuantLogoProps } from './AppMark';

/**
 * QuantDrive's mark: a tabbed folder cut out of the brand plate with the upload
 * arrow painted back in, so the glyph says what the product does rather than just
 * naming its container.
 */
export function QuantDriveLogo({
  size = 32,
  className = '',
  title = 'QuantDrive',
}: QuantLogoProps) {
  return (
    <AppMark size={size} className={className} title={title}>
      {(brand) => (
        <>
          <path
            d="M6.6 12.2A2.2 2.2 0 0 1 8.8 10H13.2L15.6 12.4H23.2A2.2 2.2 0 0 1 25.4 14.6V21.8A2.2 2.2 0 0 1 23.2 24H8.8A2.2 2.2 0 0 1 6.6 21.8Z"
            fill={MARK_VOID}
          />
          <path
            d="M16 21.4V15.3M13.1 18.2 16 15.2 18.9 18.2"
            stroke={brand}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </AppMark>
  );
}

export default QuantDriveLogo;
