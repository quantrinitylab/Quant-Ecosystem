'use client';

export type QuantLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function QuantDriveLogo({
  size = 32,
  className = '',
  title = 'QuantDrive',
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
            id="qdrv-grad"
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
        <path
          d="M6.5 23.5H25.5C26.6 23.5 27.5 22.6 27.5 21.5V11.5C27.5 10.4 26.6 9.5 25.5 9.5H16.5L14 7.5H6.5C5.4 7.5 4.5 8.4 4.5 9.5V21.5C4.5 22.6 5.4 23.5 6.5 23.5Z"
          stroke="url(#qdrv-grad)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M11 16.5H21" stroke="url(#qdrv-grad)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default QuantDriveLogo;
