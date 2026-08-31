'use client';

import { AppMark, MARK_VOID, type QuantLogoProps } from './AppMark';

/**
 * QuantGit's mark: a branch graph. The `</>` chevrons this replaced read as
 * "markup" rather than "version control", and every code tool in the industry uses
 * them, so the mark said nothing about the product.
 */
export function QuantGitLogo({ size = 32, className = '', title = 'QuantGit' }: QuantLogoProps) {
  return (
    <AppMark size={size} className={className} title={title}>
      {(brand) => (
        <>
          <path
            d="M11.5 9.6V22.4M11.5 14C11.5 17.3 20.5 14.9 20.5 18.4"
            stroke={MARK_VOID}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="11.5" cy="9.6" r="2.7" fill={MARK_VOID} />
          <circle cx="11.5" cy="22.4" r="2.7" fill={MARK_VOID} />
          <circle cx="20.5" cy="18.4" r="2.7" fill={MARK_VOID} />
          <circle cx="11.5" cy="9.6" r="1.15" fill={brand} />
          <circle cx="11.5" cy="22.4" r="1.15" fill={brand} />
          <circle cx="20.5" cy="18.4" r="1.15" fill={brand} />
        </>
      )}
    </AppMark>
  );
}

export default QuantGitLogo;
