'use client';

export type QuantLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function QuantCalendarLogo({
  size = 32,
  className = '',
  title = 'QuantCalendar',
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
            id="qcal-grad"
            x1="4"
            y1="4"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF7A00" />
            <stop offset="1" stopColor="#FFA800" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="#111318" stroke="#283042" strokeWidth="1" />
        <rect
          x="6.5"
          y="7.5"
          width="19"
          height="18"
          rx="3"
          stroke="url(#qcal-grad)"
          strokeWidth="1.8"
        />
        <path d="M6.5 13.5H25.5" stroke="url(#qcal-grad)" strokeWidth="1.8" />
        <path
          d="M11 5.5V8.5M21 5.5V8.5"
          stroke="url(#qcal-grad)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="16" cy="19" r="2.2" fill="url(#qcal-grad)" />
      </svg>
    </span>
  );
}

export default QuantCalendarLogo;
