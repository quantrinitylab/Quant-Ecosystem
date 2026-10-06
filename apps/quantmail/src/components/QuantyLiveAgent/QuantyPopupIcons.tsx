/**
 * Inline SVG icon set for the Quanty popup. No emoji, no icon font —
 * per the codebase convention every glyph is an inline SVG.
 */

interface IconProps {
  width?: number;
  height?: number;
  className?: string;
}

function base({ width = 18, height = 18, className }: IconProps) {
  return { width, height, className, viewBox: '0 0 20 20', fill: 'none' as const, 'aria-hidden': true as const };
}

/** List icon — Activity tab. */
export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 5.5h10M7 10h10M7 14.5h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="3.8" cy="5.5" r="1.2" fill="currentColor" />
      <circle cx="3.8" cy="10" r="1.2" fill="currentColor" />
      <circle cx="3.8" cy="14.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** Shield icon — Approvals tab. */
export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2.5l6 2.3v5c0 4-2.6 6.4-6 7.7-3.4-1.3-6-3.7-6-7.7v-5l6-2.3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M7.2 10l2 2 3.6-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Monitor icon — Browser tab. */
export function MonitorIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="4" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 17.5h4M10 14v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Clock icon — Schedule tab. */
export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 6v4.2l2.8 1.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Fingerprint icon — Identity tab. */
export function FingerprintIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M6.5 4.8A7.5 7.5 0 0117.5 10c0 2-.2 3.9-.7 5.7M10 2.5c-1.5 0-2.9.4-4.1 1.2M4.2 8.2c-.6 1.7-.9 3.7-.9 5.8 0 .9 0 1.8.1 2.6M7.3 7.2c-1 1.4-1.6 3.4-1.6 5.6 0 1.3.1 2.5.3 3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 7.5c-1.7 0-3 1.8-3 4.5 0 1.2.1 2.3.4 3.2M10 7.5c1.7 0 3 1.8 3 4.5 0 2.2-.4 4-1 5.3M10 7.5v3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mic icon — Voice Live Agent. */
export function MicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5M7.5 17.5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Chat bubble icon. */
export function ChatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M17 11.5a5.5 5.5 0 01-5.5 5.5H4l-1.5 1.5v-1.6A5.5 5.5 0 012.5 11.5v-3A5.5 5.5 0 018 3h3.5A5.5 5.5 0 0117 8.5v3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Share icon. */
export function ShareIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="14" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="14" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.2 10.8l3.6-3.6M8.2 13.2l3.6 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** X icon. */
export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Heart icon — SOUL card. */
export function HeartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 17S3.5 12.6 3.5 7.8A3.9 3.9 0 017.4 4c1.2 0 2 .6 2.6 1.4A3.9 3.9 0 0112.6 4a3.9 3.9 0 013.9 3.8C16.5 12.6 10 17 10 17z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cloud icon — MEMORY card. */
export function CloudIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M6 15.5a3.8 3.8 0 01-.6-7.5 5.2 5.2 0 0110.1 1.2 3.3 3.3 0 01-.5 6.3H6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Code brackets icon — activity entries. */
export function CodeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 6.5L4 10l3.5 3.5M12.5 6.5L16 10l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mail icon — activity entries. */
export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 7l6.5 4.5L16.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Calendar icon — activity entries. */
export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 8.5h14M7 2.8V6M13 2.8V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Pencil/edit icon. */
export function EditIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M13.5 4.5l2 2L8 14l-2.7.7.7-2.7 7.5-7.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Check icon. */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.5l4 4L16 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
