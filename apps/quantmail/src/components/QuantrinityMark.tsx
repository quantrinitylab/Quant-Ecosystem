import { useId } from 'react';

interface QuantrinityMarkProps {
  className?: string;
  compact?: boolean;
  label?: string;
}

/** The Quantrinity infinity ribbon: saffron origin, white bridge, green momentum. */
export function QuantrinityMark({
  className = '',
  compact = false,
  label = 'Quantrinity',
}: QuantrinityMarkProps) {
  const id = useId().replace(/:/g, '');
  const depth = `${id}-depth`;
  const glow = `${id}-glow`;
  const ribbon = `${id}-ribbon`;
  const sheen = `${id}-sheen`;
  const shadow = `${id}-shadow`;

  return (
    <span
      className={`quantrinity-mark ${compact ? 'is-compact' : ''} ${className}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 64 44" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={ribbon} x1="8" y1="8" x2="57" y2="37" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB15F" />
            <stop offset="0.28" stopColor="#FF8A18" />
            <stop offset="0.47" stopColor="#FFF8E8" />
            <stop offset="0.58" stopColor="#E8EEF4" />
            <stop offset="0.78" stopColor="#45B94D" />
            <stop offset="1" stopColor="#0F700B" />
          </linearGradient>
          <linearGradient id={depth} x1="8" y1="16" x2="56" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#873300" />
            <stop offset="0.5" stopColor="#6F746F" />
            <stop offset="1" stopColor="#063F09" />
          </linearGradient>
          <linearGradient id={sheen} x1="13" y1="10" x2="49" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.92" />
            <stop offset="0.48" stopColor="white" stopOpacity="0.12" />
            <stop offset="1" stopColor="white" stopOpacity="0.62" />
          </linearGradient>
          <radialGradient
            id={glow}
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(19 12) rotate(42) scale(28 24)"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FF9933" stopOpacity="0.28" />
            <stop offset="1" stopColor="#FF9933" stopOpacity="0" />
          </radialGradient>
          <filter id={shadow} x="-35%" y="-45%" width="170%" height="210%">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="3.2"
              floodColor="#000000"
              floodOpacity="0.82"
            />
          </filter>
        </defs>
        <ellipse cx="23" cy="19" rx="26" ry="22" fill={`url(#${glow})`} />
        <g transform="translate(6 0)">
          <path
            d="M10 35.2c-5.1 0-8.7-4-8.7-9.1S4.9 17 10 17c7.1 0 11.3 5.2 15.2 10 3.6 4.4 6.7 8.2 11.6 8.2 3.7 0 6.4-2.8 6.4-6.4s-2.7-6.4-6.4-6.4c-3.1 0-5.5 2.1-8.5 5.7l-4.6-5.3c3.9-4.7 7.8-7.8 13.1-7.8 7.9 0 13.9 5.9 13.9 13.8s-6 13.8-13.9 13.8c-8.4 0-13.4-6-17.7-11.2-3.4-4.2-6.1-7.2-9.1-7.2-1.2 0-2.1.8-2.1 1.9S8.8 28 10 28c2 0 3.9-1.7 6.5-4.7l4.6 5.3c-3.8 4.2-7.2 6.6-11.1 6.6Z"
            fill={`url(#${depth})`}
            opacity="0.92"
          />
          <path
            d="M10 33c-5.1 0-8.7-4-8.7-9.1S4.9 14.8 10 14.8c7.1 0 11.3 5.2 15.2 10 3.6 4.4 6.7 8.2 11.6 8.2 3.7 0 6.4-2.8 6.4-6.4s-2.7-6.4-6.4-6.4c-3.1 0-5.5 2.1-8.5 5.7l-4.6-5.3c3.9-4.7 7.8-7.8 13.1-7.8 7.9 0 13.9 5.9 13.9 13.8s-6 13.8-13.9 13.8c-8.4 0-13.4-6-17.7-11.2-3.4-4.2-6.1-7.2-9.1-7.2-1.2 0-2.1.8-2.1 1.9s.9 1.9 2.1 1.9c2 0 3.9-1.7 6.5-4.7l4.6 5.3C17.3 30.6 13.9 33 10 33Z"
            fill={`url(#${ribbon})`}
            filter={`url(#${shadow})`}
          />
          <path
            d="M10 17.6c6 0 9.7 4.6 13.7 9.4 3.8 4.6 7.4 8.9 13.1 8.9 5.4 0 9.5-4 10.3-9"
            stroke={`url(#${sheen})`}
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.72"
          />
          <circle cx="32" cy="22" r="2.8" fill="#0B3D91" stroke="white" strokeWidth="0.75" />
          <circle cx="32" cy="22" r="0.9" fill="white" />
        </g>
      </svg>
    </span>
  );
}
