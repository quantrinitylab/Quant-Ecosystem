'use client';

export type QuantLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function QuantCodeLogo({ size = 32, className = '', title = 'QuantCode' }: QuantLogoProps) {
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
            id="qcode-grad"
            x1="4"
            y1="4"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF8C42" />
            <stop offset="1" stopColor="#FFA800" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="#111318" stroke="#283042" strokeWidth="1" />
        <path
          d="M11 12L7 16L11 20M21 12L25 16L21 20M18 9L14 23"
          stroke="url(#qcode-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default QuantCodeLogo;
