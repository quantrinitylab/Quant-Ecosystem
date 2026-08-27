'use client';

export type QuantLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function QuantContactsLogo({
  size = 32,
  className = '',
  title = 'QuantContacts',
}: QuantLogoProps) {
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
            id="qcnt-grad"
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
        <circle cx="16" cy="12.5" r="4" stroke="url(#qcnt-grad)" strokeWidth="1.8" />
        <path
          d="M8.5 24.5C8.5 20.5 11.5 18.5 16 18.5C20.5 18.5 23.5 20.5 23.5 24.5"
          stroke="url(#qcnt-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default QuantContactsLogo;
