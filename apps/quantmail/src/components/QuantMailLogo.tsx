'use client';

export type QuantMailLogoProps = {
  /** Rendered square size in px. */
  size?: number;
  /** Extra class names */
  className?: string;
  /** Title / accessible label */
  title?: string;
};

/**
 * QuantMail official brand mark — Precision geometric SVG Envelope Vector Mark.
 */
export function QuantMailLogo({
  size = 32,
  className = '',
  title = 'QuantMail',
}: QuantMailLogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
      title={title}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="qm-brand-grad"
            x1="4"
            y1="4"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF7A00" />
            <stop offset="1" stopColor="#FFA800" />
          </linearGradient>
          <linearGradient
            id="qm-fold-grad"
            x1="8"
            y1="10"
            x2="24"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF7A00" stopOpacity="0.9" />
            <stop offset="1" stopColor="#FF9933" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Rounded dark background tile */}
        <rect width="32" height="32" rx="8" fill="#111318" stroke="#283042" strokeWidth="1" />

        {/* Envelope Base Body */}
        <path
          d="M7 11C7 9.89543 7.89543 9 9 9H23C24.1046 9 25 9.89543 25 11V21C25 22.1046 24.1046 23 23 23H9C7.89543 23 7 22.1046 7 21V11Z"
          stroke="url(#qm-brand-grad)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {/* Envelope Top V-Fold */}
        <path
          d="M7.5 10L16 16.5L24.5 10"
          stroke="url(#qm-brand-grad)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Subtle Bottom Crease Accent */}
        <path
          d="M10 22.5L13.5 18M22 22.5L18.5 18"
          stroke="#FF7A00"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeOpacity="0.45"
        />
      </svg>
    </span>
  );
}

export default QuantMailLogo;
