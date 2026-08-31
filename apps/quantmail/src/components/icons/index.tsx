'use client';

// ============================================================================
// Quant icon set — inline SVG only
// ============================================================================
// The design system forbids raw pictographic emoji in product chrome: they
// render differently per-platform, ignore `currentColor`, cannot inherit
// stroke weight, and are announced by screen readers as their CLDR name.
//
// Everything here is a 24x24 stroke-based glyph drawn in `currentColor` at a
// single weight, so an icon inherits the text colour and optical size of
// whatever it sits next to. Icons are `aria-hidden` by default — they are
// decoration beside a real label. Pass an `aria-label` (and `role="img"`) only
// when a glyph is genuinely the sole carrier of meaning.

import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Rendered edge length in px. Defaults to 16 to sit on a 20px text line. */
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

// --- Files and storage ------------------------------------------------------

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.6A1.6 1.6 0 0 1 4.6 6h3.9l2 2.6h6.9A1.6 1.6 0 0 1 19 10.2v7.2A1.6 1.6 0 0 1 17.4 19H4.6A1.6 1.6 0 0 1 3 17.4Z" />
    </Svg>
  );
}
export function IconFolderOpen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17.4V7.6A1.6 1.6 0 0 1 4.6 6h3.9l2 2.6h6.9A1.6 1.6 0 0 1 19 10.2v1.1" />
      <path d="M3 17.4 5.4 11.3h15.1L18.1 17.4a1.6 1.6 0 0 1-1.5 1.6H4.6A1.6 1.6 0 0 1 3 17.4Z" />
    </Svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6Z" />
      <path d="M14 3v4.6h4.6" />
    </Svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6Z" />
      <path d="M14 3v4.6h4.6M8.6 12.6h6.8M8.6 16h4.6" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="5" width="17.2" height="14" rx="1.8" />
      <circle cx="8.6" cy="10" r="1.5" />
      <path d="m3.9 17.4 4.4-4.2a1.6 1.6 0 0 1 2.2 0l3.1 3 2-1.9a1.6 1.6 0 0 1 2.2 0l2.7 2.6" />
    </Svg>
  );
}

export function IconVideo(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.6" y="6" width="12.6" height="12" rx="1.8" />
      <path d="m15.2 12.6 4.6 3a.7.7 0 0 0 1.1-.6V9a.7.7 0 0 0-1.1-.6l-4.6 3Z" />
    </Svg>
  );
}
export function IconAudio(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5.4 6.6 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6L11 18.6Z" />
      <path d="M15.4 9.4a3.7 3.7 0 0 1 0 5.2M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
    </Svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 7.4h17.2M4.8 7.4v11.2A1.6 1.6 0 0 0 6.4 20h11.2a1.6 1.6 0 0 0 1.6-1.4V7.4" />
      <path d="M4.4 7.4 6 4.4a1 1 0 0 1 .9-.4h10.2a1 1 0 0 1 .9.4l1.6 3M10.4 12h3.2" />
    </Svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 8.6-4 3.4 4 3.4M15 8.6l4 3.4-4 3.4M13.4 5.6l-2.8 12.8" />
    </Svg>
  );
}

export function IconTerminal(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.4" width="18" height="15.2" rx="1.8" />
      <path d="m7.4 10 2.4 2.2-2.4 2.2M12.4 14.8h4.2" />
    </Svg>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="6.4" rx="7.4" ry="2.8" />
      <path d="M4.6 6.4v11.2c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8V6.4" />
      <path d="M4.6 12c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8" />
    </Svg>
  );
}
export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6s-1.2 6.2-3.4 8.6c-2.2-2.4-3.4-5.4-3.4-8.6S9.8 5.8 12 3.4Z" />
    </Svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.2 0 1.8-.8 1.8-1.7 0-.9-.6-1.5-.6-2.2 0-.8.6-1.4 1.5-1.4h1.5a4.4 4.4 0 0 0 4.4-4.4c0-4.2-3.8-7.5-8.6-7.5Z" />
      <circle cx="8.4" cy="10" r="1.1" />
      <circle cx="12" cy="7.6" r="1.1" />
      <circle cx="15.6" cy="10" r="1.1" />
    </Svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.6H7.4A1.6 1.6 0 0 0 5.8 6.2v13.2A1.6 1.6 0 0 0 7.4 21h9.2a1.6 1.6 0 0 0 1.6-1.6V6.2a1.6 1.6 0 0 0-1.6-1.6H15" />
      <rect x="9" y="3" width="6" height="3.4" rx="1.1" />
    </Svg>
  );
}

export function IconPackage(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.6 8.4v7.2a1.6 1.6 0 0 1-.8 1.4l-7 3.9a1.6 1.6 0 0 1-1.6 0l-7-3.9a1.6 1.6 0 0 1-.8-1.4V8.4a1.6 1.6 0 0 1 .8-1.4l7-3.9a1.6 1.6 0 0 1 1.6 0l7 3.9a1.6 1.6 0 0 1 .8 1.4Z" />
      <path d="m3.6 7.6 8.4 4.6 8.4-4.6M12 20.8v-8.6" />
    </Svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16.4 3.8a1.9 1.9 0 0 1 2.7 0l1.1 1.1a1.9 1.9 0 0 1 0 2.7L8.6 19.2 4 20l.8-4.6Z" />
      <path d="m15 5.2 3.8 3.8" />
    </Svg>
  );
}
// --- Mail, calendar and people ---------------------------------------------

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.8" y="5" width="18.4" height="14" rx="2" />
      <path d="m3.4 7 7.6 5.4a1.8 1.8 0 0 0 2 0L20.6 7" />
    </Svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.6 3.4 2.8 10.2l6.6 2.6 2.6 6.6Z" />
      <path d="m9.4 12.8 4.8-4.8" />
    </Svg>
  );
}

export function IconPaperclip(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11.6l-8.2 8.2a4.9 4.9 0 0 1-7-7l8.4-8.4a3.3 3.3 0 0 1 4.6 4.6l-8.3 8.4a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6" />
    </Svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="5.4" width="17.2" height="15.2" rx="1.8" />
      <path d="M3.4 10.2h17.2M8.4 3.4v3.6M15.6 3.4v3.6" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.2 2" />
    </Svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15.8 20.2v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.6A3.6 3.6 0 0 0 3 18.4v1.8" />
      <circle cx="9.4" cy="7.8" r="3.6" />
      <path d="M21 20.2v-1.8a3.6 3.6 0 0 0-2.7-3.5M16.2 4.5a3.6 3.6 0 0 1 0 6.9" />
    </Svg>
  );
}
export function IconVideoCall(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.8" y="6.4" width="12.4" height="11.2" rx="1.8" />
      <path d="m15.2 11.8 4.5-2.9a.8.8 0 0 1 1.3.7v4.8a.8.8 0 0 1-1.3.7l-4.5-2.9Z" />
    </Svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.6 11.6a7.6 7.6 0 0 1-8.2 7.6 8.6 8.6 0 0 1-2.4-.4L4.6 20.6l1.8-4.6a7.6 7.6 0 0 1-1-3.8 7.6 7.6 0 0 1 8.2-7.6 7.7 7.7 0 0 1 7 7Z" />
    </Svg>
  );
}

export function IconReply(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6.4-5 4.8 5 4.8" />
      <path d="M4 11.2h8.6a6 6 0 0 1 6 6v1.4" />
    </Svg>
  );
}

export function IconForward(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 6.4 5 4.8-5 4.8" />
      <path d="M20 11.2h-8.6a6 6 0 0 0-6 6v1.4" />
    </Svg>
  );
}

// --- Status and feedback ----------------------------------------------------

export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 4.1 2.9 17.2a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.1a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.4v3.8M12 16.6h.01" />
    </Svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.2 12.2 2.6 2.6 5-5.2" />
    </Svg>
  );
}
export function IconBan(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m5.9 5.9 12.2 12.2" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.4 11.2a8.4 8.4 0 0 0-14.3-4.6L3 9.6M3.6 12.8a8.4 8.4 0 0 0 14.3 4.6L21 14.4" />
      <path d="M3 5.4v4.2h4.2M21 18.6v-4.2h-4.2" />
    </Svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4.6 5.8v5.4c0 4.3 3 8.2 7.4 9.6 4.4-1.4 7.4-5.3 7.4-9.6V5.8Z" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.8" y="10.4" width="14.4" height="10.2" rx="1.8" />
      <path d="M8.4 10.4V7.6a3.6 3.6 0 0 1 7.2 0v2.8" />
    </Svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.4 2.4 4.8 13.4h5.6l-.8 8.2 8.6-11h-5.6Z" />
    </Svg>
  );
}

export function IconFlame(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.6s4.8 3.6 4.8 8.2a4.8 4.8 0 0 1-9.6 0c0-1.7.8-3.2 1.8-4.4" />
      <path d="M12 21.4a3.4 3.4 0 0 0 3.4-3.4c0-2.2-3.4-4.6-3.4-4.6s-3.4 2.4-3.4 4.6a3.4 3.4 0 0 0 3.4 3.4Z" />
    </Svg>
  );
}
export function IconSparkle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 3.4l1.5 4.1 4.1 1.5-4.1 1.5L11 14.6 9.5 10.5 5.4 9l4.1-1.5Z" />
      <path d="M17.6 14.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
    </Svg>
  );
}

export function IconLightbulb(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.4 18.4h5.2M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.8 1 .8 1.6v.9h5.2v-.9c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
    </Svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.2" />
    </Svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20.4V3.6M4 20.4h16.4" />
      <path d="M8 17V11.4M12.4 17V6.8M16.8 17v-7.4" />
    </Svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3.4 2.7 5.5 6 .9-4.4 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.3 9.8l6-.9Z" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6v11.6M7.4 10.8 12 15.4l4.6-4.6" />
      <path d="M4 18.4v.6A1.6 1.6 0 0 0 5.6 20.6h12.8A1.6 1.6 0 0 0 20 19v-.6" />
    </Svg>
  );
}
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.9" />
      <path d="M19.1 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.5-1l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.5 1.5 0 0 0-1-2.5H4.5a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.5l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.5 1.5 0 0 0 2.5-1V4a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.5 1l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.5 1.5 0 0 0 1 2.5h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" />
    </Svg>
  );
}

export function IconThermometer(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 14.8V5.4a2 2 0 1 0-4 0v9.4a4 4 0 1 0 4 0Z" />
      <path d="M12 17.6h.01" />
    </Svg>
  );
}

export function IconScale(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.4v17.2M6.6 20.6h10.8" />
      <path d="M6.6 6.6h10.8M3 12l3.6-5.4L10.2 12a3.6 3.6 0 0 1-7.2 0ZM13.8 12l3.6-5.4L21 12a3.6 3.6 0 0 1-7.2 0Z" />
    </Svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15.2V3.6M7.4 8.2 12 3.6l4.6 4.6" />
      <path d="M4 18.4v.6A1.6 1.6 0 0 0 5.6 20.6h12.8A1.6 1.6 0 0 0 20 19v-.6" />
    </Svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="5.6" r="2.8" />
      <circle cx="6" cy="12" r="2.8" />
      <circle cx="18" cy="18.4" r="2.8" />
      <path d="m8.5 10.6 7-3.6M8.5 13.4l7 3.6" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.8 6.6h16.4M8.4 6.6V4.8a1.4 1.4 0 0 1 1.4-1.4h4.4a1.4 1.4 0 0 1 1.4 1.4v1.8" />
      <path d="M5.8 6.6l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h7.4a1.6 1.6 0 0 0 1.6-1.5l.9-12.2M10.2 10.6v6M13.8 10.6v6" />
    </Svg>
  );
}

export function IconSlides(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="4.4" width="17.2" height="11.2" rx="1.6" />
      <path d="M12 15.6v3.2M8.4 20.6 12 18.8l3.6 1.8" />
    </Svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.2 13.8a4.2 4.2 0 0 0 6.1 0l2.5-2.6a4.3 4.3 0 0 0-6.1-6l-1.4 1.5" />
      <path d="M13.8 10.2a4.2 4.2 0 0 0-6.1 0l-2.5 2.6a4.3 4.3 0 0 0 6.1 6l1.4-1.5" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.6 5.4 6.6 6.6-6.6 6.6" />
    </Svg>
  );
}

export function IconCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.2 18.4H7a4.4 4.4 0 0 1-.5-8.8 6 6 0 0 1 11.4 1.4 3.7 3.7 0 0 1-.7 7.4Z" />
    </Svg>
  );
}

/**
 * A crisp status dot. Replaces the coloured-circle emoji (🔴 🔵 🟤 🟦 🟨),
 * which cannot inherit size and rendered as a different hue on every platform.
 */
export function IconDot({ size = 10, tone, ...rest }: IconProps & { tone?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <circle cx="5" cy="5" r="4" fill={tone ?? 'currentColor'} />
    </svg>
  );
}
// --- File-type resolution ---------------------------------------------------

type IconComponent = (props: IconProps) => ReactNode;

/**
 * Extension -> glyph, plus an optional tone.
 *
 * A tone is only set where the colour *is* the information (language identity,
 * the way GitHub tints a repo's language bar). Everything else inherits
 * `currentColor` so it takes the colour of the row it sits in.
 */
const FILE_TYPES: Record<string, { icon: IconComponent; tone?: string }> = {
  ts: { icon: IconCode, tone: '#3178C6' },
  tsx: { icon: IconCode, tone: '#3178C6' },
  mts: { icon: IconCode, tone: '#3178C6' },
  cts: { icon: IconCode, tone: '#3178C6' },
  js: { icon: IconCode, tone: '#F1E05A' },
  jsx: { icon: IconCode, tone: '#F1E05A' },
  mjs: { icon: IconCode, tone: '#F1E05A' },
  cjs: { icon: IconCode, tone: '#F1E05A' },
  py: { icon: IconCode, tone: '#3572A5' },
  rs: { icon: IconCode, tone: '#DEA584' },
  go: { icon: IconCode, tone: '#00ADD8' },
  java: { icon: IconCode, tone: '#B07219' },
  rb: { icon: IconCode, tone: '#701516' },
  php: { icon: IconCode, tone: '#4F5D95' },
  c: { icon: IconCode, tone: '#555555' },
  cpp: { icon: IconCode, tone: '#F34B7D' },
  cs: { icon: IconCode, tone: '#178600' },
  swift: { icon: IconCode, tone: '#F05138' },
  kt: { icon: IconCode, tone: '#A97BFF' },
  html: { icon: IconGlobe, tone: '#E34C26' },
  css: { icon: IconPalette, tone: '#563D7C' },
  scss: { icon: IconPalette, tone: '#C6538C' },
  json: { icon: IconClipboard },
  yml: { icon: IconSettings },
  yaml: { icon: IconSettings },
  toml: { icon: IconSettings },
  env: { icon: IconLock },
  md: { icon: IconPencil },
  mdx: { icon: IconPencil },
  txt: { icon: IconFileText },
  pdf: { icon: IconFileText, tone: '#F87171' },
  doc: { icon: IconFileText },
  docx: { icon: IconFileText },
  xls: { icon: IconChart },
  xlsx: { icon: IconChart },
  csv: { icon: IconChart },
  ppt: { icon: IconChart },
  pptx: { icon: IconChart },
  sh: { icon: IconTerminal },
  bash: { icon: IconTerminal },
  zsh: { icon: IconTerminal },
  sql: { icon: IconDatabase },
  db: { icon: IconDatabase },
  svg: { icon: IconImage },
  png: { icon: IconImage },
  jpg: { icon: IconImage },
  jpeg: { icon: IconImage },
  gif: { icon: IconImage },
  webp: { icon: IconImage },
  avif: { icon: IconImage },
  ico: { icon: IconImage },
  mp4: { icon: IconVideo },
  mov: { icon: IconVideo },
  webm: { icon: IconVideo },
  mkv: { icon: IconVideo },
  mp3: { icon: IconAudio },
  wav: { icon: IconAudio },
  flac: { icon: IconAudio },
  m4a: { icon: IconAudio },
  zip: { icon: IconArchive },
  tar: { icon: IconArchive },
  gz: { icon: IconArchive },
  rar: { icon: IconArchive },
  '7z': { icon: IconArchive },
};
export interface MimeTypeIconProps extends IconProps {
  /** MIME type, e.g. `application/pdf`. Matched case-insensitively. */
  mimeType?: string | null;
  /** Drive-style node kind. `'folder'` short-circuits the MIME match. */
  kind?: string | null;
  isExpanded?: boolean;
  tinted?: boolean;
}

/**
 * MIME-type counterpart to {@link FileTypeIcon}, for the Drive surfaces that
 * only ever see a MIME string. Same glyph vocabulary, so a `.pdf` looks
 * identical whether it arrived from a filename or from a Drive listing.
 */
export function MimeTypeIcon({
  mimeType,
  kind,
  isExpanded = false,
  tinted = true,
  style,
  ...rest
}: MimeTypeIconProps) {
  if (kind === 'folder') {
    const Folder = isExpanded ? IconFolderOpen : IconFolder;
    return <Folder style={{ color: '#FFB875', ...style }} {...rest} />;
  }

  const m = (mimeType ?? '').toLowerCase();
  let Glyph: IconComponent = IconFile;
  let tone: string | undefined;

  if (m.startsWith('image/')) Glyph = IconImage;
  else if (m.startsWith('video/')) Glyph = IconVideo;
  else if (m.startsWith('audio/')) Glyph = IconAudio;
  else if (m.includes('pdf')) {
    Glyph = IconFileText;
    tone = '#F87171';
  } else if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv'))
    Glyph = IconChart;
  else if (m.includes('presentation') || m.includes('powerpoint')) Glyph = IconSlides;
  else if (m.includes('word') || m.includes('document')) Glyph = IconFileText;
  else if (m.includes('zip') || m.includes('compressed') || m.includes('tar')) Glyph = IconArchive;
  else if (m.includes('json') || m.includes('javascript') || m.includes('typescript'))
    Glyph = IconCode;
  else if (m.startsWith('text/')) Glyph = IconFileText;

  const colour = tinted ? tone : undefined;
  return <Glyph style={colour ? { color: colour, ...style } : style} {...rest} />;
}

/** Lowercased final extension of a filename, or `''` when there isn't one. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  // A leading dot means a dotfile (`.env`, `.gitignore`), not an extension.
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : base.replace(/^\./, '').toLowerCase();
}

export interface FileTypeIconProps extends IconProps {
  /** Filename or path. Only the extension is read. */
  name: string;
  isFolder?: boolean;
  isExpanded?: boolean;
  /** Apply the language tone. Off when the icon must match surrounding text. */
  tinted?: boolean;
}

/**
 * Single source of truth for "what glyph represents this file". Previously each
 * surface kept its own emoji switch, so the same `.tsx` file showed a different
 * glyph in the tree, the Drive grid and the attachment picker.
 */
export function FileTypeIcon({
  name,
  isFolder = false,
  isExpanded = false,
  tinted = true,
  style,
  ...rest
}: FileTypeIconProps) {
  if (isFolder) {
    const Folder = isExpanded ? IconFolderOpen : IconFolder;
    return <Folder style={{ color: '#FFB875', ...style }} {...rest} />;
  }

  const entry = FILE_TYPES[fileExtension(name)];
  const Glyph = entry?.icon ?? IconFile;
  const tone = tinted ? entry?.tone : undefined;
  return <Glyph style={tone ? { color: tone, ...style } : style} {...rest} />;
}

/* ------------------------------------------------------------------------- *
 * UI chrome
 *
 * Affordances rather than nouns: the glyphs a control needs to explain itself
 * (close, confirm, search, paginate). Kept in the same module as the file
 * glyphs so there is one import site and one stroke weight for the whole app.
 * ------------------------------------------------------------------------- */

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </Svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Svg>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export function IconMoreHorizontal(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="19" cy="12" r="1.1" fill="currentColor" />
    </Svg>
  );
}

export function IconMoreVertical(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5h18l-7 8.2V20l-4-2.4v-4.4L3 5Z" />
    </Svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 6.1A8.6 8.6 0 0 1 12 6c6.2 0 9.8 6 9.8 6a17 17 0 0 1-2.5 3.2M6.4 7.6A16.6 16.6 0 0 0 2.2 12s3.6 6 9.8 6a9 9 0 0 0 3.6-.7" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </Svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
      <path d="M3 12l2.6-6.4A2 2 0 0 1 7.5 4.4h9a2 2 0 0 1 1.9 1.2L21 12h-5l-1.4 2.2H9.4L8 12H3Z" />
    </Svg>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20s-7.2-4.5-7.2-9.4A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.2 2.8C19.2 15.5 12 20 12 20Z" />
    </Svg>
  );
}

/** Replaces the 💌 "love letter" emoji used as the Postcards Studio wordmark. */
export function IconMailHeart(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="m2.9 6.4 7.7 5.6a2.4 2.4 0 0 0 2.8 0l7.7-5.6" />
      <path d="M12 17.6s-2.7-1.6-2.7-3.4a1.6 1.6 0 0 1 2.7-1 1.6 1.6 0 0 1 2.7 1c0 1.8-2.7 3.4-2.7 3.4Z" />
    </Svg>
  );
}

export function IconRocket(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.6 3.4c3.4-1 6 1.6 5 5-.7 2.4-3 5-6.6 7.2L9.4 13c2.2-3.6 4.8-5.9 7.2-6.6" />
      <path d="M9.4 13 7 12l-3 1.4 2.6 1.4M11 15.6 12 18l-1.4 3-1.4-2.6" />
      <path d="M5.5 18.5 3 21" />
    </Svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </Svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5 19 12 7 19.5V4.5Z" />
    </Svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.5v15M15 4.5v15" />
    </Svg>
  );
}

export function IconSquare(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </Svg>
  );
}

export function IconGitBranch(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4v10.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M18 8.5c0 4-4.5 4.5-6.6 5.2A4 4 0 0 0 8.4 17" />
    </Svg>
  );
}

export function IconGitCommit(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2.5 12h6M15.5 12h6" />
    </Svg>
  );
}

export function IconGitPullRequest(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.5" cy="6" r="2.5" />
      <circle cx="6.5" cy="18" r="2.5" />
      <path d="M6.5 8.5v7" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="M17.5 15.5V9a3 3 0 0 0-3-3h-2.6m0 0 2-2m-2 2 2 2" />
    </Svg>
  );
}

export function IconGitMerge(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.5" cy="6" r="2.5" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="12" r="2.5" />
      <path d="M6.5 8.5v7M6.5 11a4 4 0 0 0 4 4h4.5" />
    </Svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 10.4c0 5.4-8 11.1-8 11.1s-8-5.7-8-11.1a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10.2" r="2.8" />
    </Svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="9" width="18" height="11.5" rx="1.8" />
      <path d="M3 13.2h18M12 9v11.5" />
      <path d="M12 9S10.4 4.5 8 4.5A2.2 2.2 0 0 0 8 9M12 9s1.6-4.5 4-4.5A2.2 2.2 0 0 1 16 9" />
    </Svg>
  );
}

export function IconCake(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20.5h16M4.5 20.5v-6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6" />
      <path d="M4.5 16.2c1.9 1.5 3.8 1.5 5.7 0s3.8-1.5 5.7 0 3.8 1.5 3.6 0" />
      <path d="M12 12.5V10M12 7.2v.01" />
    </Svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="7.5" width="19" height="12.5" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M2.5 12.6h19" />
    </Svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.4 3.5h2.7l1.4 3.5-2 1.3a10.4 10.4 0 0 0 5.2 5.2l1.3-2 3.5 1.4v2.7a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 4.4 5.7a2 2 0 0 1 2-2.2Z" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
    </Svg>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6v5M12 16.2v.01" />
    </Svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.4M12 7.8v.01" />
    </Svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.4 12.6 12.6 20.4a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.6-1.6l.5-6a2 2 0 0 1 1.8-1.8l6-.5a2 2 0 0 1 1.6.6l6.2 6.2a2 2 0 0 1 0 2.8Z" />
      <circle cx="8.4" cy="8.4" r="1.4" />
    </Svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21V4M5 4.6h11.5l-1.6 4 1.6 4H5" />
    </Svg>
  );
}

export function IconSnooze(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.6V13l2.4 1.6M14.5 2.5h5l-5 4h5" />
    </Svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 8.5h10a5.5 5.5 0 0 1 0 11H8" />
      <path d="m7.5 4.5-4 4 4 4" />
    </Svg>
  );
}

export function IconTrendUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m3.5 17 5.5-5.5 3.5 3.5L20.5 7" />
      <path d="M15.5 7h5v5" />
    </Svg>
  );
}

export function IconTrendDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m3.5 7 5.5 5.5 3.5-3.5L20.5 17" />
      <path d="M15.5 17h5v-5" />
    </Svg>
  );
}

export function IconWifiOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3l18 18" />
      <path d="M8.3 8.6A11 11 0 0 0 3 11.5M12 4.5a15.5 15.5 0 0 1 9 3M6.5 15a7 7 0 0 1 2.4-1.7M17.5 13.3a7 7 0 0 0-2.6-1.6" />
      <path d="M12 19.5v.01" />
    </Svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 2.8 9 4.6-9 4.6-9-4.6 9-4.6Z" />
      <path d="m3 12.4 9 4.6 9-4.6M3 16.6l9 4.6 9-4.6" />
    </Svg>
  );
}

/**
 * An indeterminate spinner. Callers add their own rotation (`animate-spin`)
 * so the motion respects `prefers-reduced-motion` at the call site.
 */
export function IconLoader(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" opacity="0.35" />
      <path d="M12 3.5v4" />
    </Svg>
  );
}

/** "Create a folder here" — the folder outline with the `IconPlus` cross inside. */
export function IconFolderPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.6A1.6 1.6 0 0 1 4.6 6h3.9l2 2.6h6.9A1.6 1.6 0 0 1 19 10.2v7.2a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.4Z" />
      <path d="M11 13.8h4M13 11.8v4" />
    </Svg>
  );
}

/** A filled star, for the "starred" state that `IconStar` outlines. */
export function IconStarFilled({ size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85Z" />
    </svg>
  );
}

// --- Phase 2: glyphs the chrome purge needed -------------------------------
// Added when the second emoji sweep ran out of reusable shapes. Anything that
// could sensibly reuse an existing glyph does (♻️ → IconRefresh, 📜 →
// IconFileText, 🙏 → IconHeart) rather than adding a near-duplicate.

/**
 * Delivered/read, the two-tick receipt. `IconCheck` is the one-tick "sent"
 * state; this is deliberately the same stroke so the three states read as a
 * progression rather than three unrelated marks.
 */
export function IconCheckDouble(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 12.6l3.4 3.4L13.2 8" />
      <path d="M9.4 15.6l1.2 1.2L21 6.4" />
    </Svg>
  );
}

/** Split a component apart. */
export function IconScissors(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <path d="M8.3 8.3 20 20M20 4 8.3 15.7" />
    </Svg>
  );
}

/** Memoization, caching — anything where the point is "remember this". */
export function IconBrain(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5.2a3 3 0 0 0-5.6 1.3A2.9 2.9 0 0 0 4.6 12a2.9 2.9 0 0 0 1.5 4.8A3 3 0 0 0 12 18.4Z" />
      <path d="M12 5.2a3 3 0 0 1 5.6 1.3A2.9 2.9 0 0 1 19.4 12a2.9 2.9 0 0 1-1.5 4.8A3 3 0 0 1 12 18.4Z" />
      <path d="M12 5.2v13.2" />
    </Svg>
  );
}

/** Test generation. */
export function IconFlask(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.4 3h5.2M10.4 3v5.6L5.6 17a2 2 0 0 0 1.7 3h9.4a2 2 0 0 0 1.7-3l-4.8-8.4V3" />
      <path d="M7.6 14.4h8.8" />
    </Svg>
  );
}

/** Flow volume, water intake, discharge — the cycle logger's measures. */
export function IconDroplet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2s5.6 6 5.6 9.6a5.6 5.6 0 0 1-11.2 0C6.4 9.2 12 3.2 12 3.2Z" />
    </Svg>
  );
}

/** A bare ring — the "nothing selected yet" marker that ⭕ was standing in for. */
export function IconCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.4" />
    </Svg>
  );
}

/** Desktop/CLI project template. */
export function IconMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.8" y="4" width="18.4" height="12.4" rx="1.8" />
      <path d="M8.4 20h7.2M12 16.4V20" />
    </Svg>
  );
}

/** Energy or activity level — the 🏃 row in the cycle logger. */
export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 12.4h4l2.6-6.6 3.8 12 2.6-5.4h5.4" />
    </Svg>
  );
}

/** Simplify, tidy up, remove redundancy. */
export function IconBroom(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 4 11 13" />
      <path d="M9.6 10.6 13.4 14.4l-4.6 4.6a2.4 2.4 0 0 1-3.4 0l-.4-.4a2.4 2.4 0 0 1 0-3.4Z" />
      <path d="M7.4 16.6 10 19.2" />
    </Svg>
  );
}

/** Greeting — the introduction and "say hello" template category. */
export function IconWave(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.6 11.4V6.2a1.4 1.4 0 0 1 2.8 0v4.4" />
      <path d="M9.4 10.2V4.8a1.4 1.4 0 0 1 2.8 0v5.4" />
      <path d="M12.2 10.4V6.4a1.4 1.4 0 0 1 2.8 0v4.6" />
      <path d="M15 11.4V8.8a1.4 1.4 0 0 1 2.8 0v3.8a7 7 0 0 1-7 7 6.2 6.2 0 0 1-6.2-6.2v-2a1.3 1.3 0 0 1 2.6 0" />
    </Svg>
  );
}

/** Gratitude — the thank-you and apology template category. */
export function IconHandshake(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.6 7.4 9.2 9.8a2 2 0 0 0 0 2.8l1 1a2 2 0 0 0 2.8 0l2.4-2.4" />
      <path d="M2.8 12.6 7 8.4l3 .6 1.6-1.6h2.6l1.8 1.8 4.2 4.2" />
      <path d="M2.8 15.4 6 18.6M21.2 15.4 18 18.6" />
    </Svg>
  );
}

/** Rest, low energy, the 😴 row in the cycle logger. */
export function IconBed(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 18.4v-8M2.8 14.4h18.4v4" />
      <path d="M21.2 14.4a3.2 3.2 0 0 0-3.2-3.2h-6.4v3.2" />
      <circle cx="7" cy="12" r="1.8" />
    </Svg>
  );
}

/**
 * Bloom — the cycle tracker's own mark, standing in for the 🌸 the period log
 * used to carry in its title and section headers. Four lobes rather than the
 * five of a real blossom: at 14px an odd petal count reads as lopsided.
 */
export function IconFlower(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 9.4a3.4 3.4 0 1 1 0-4.8 3.4 3.4 0 1 1 0 4.8Z" />
      <path d="M12 14.6a3.4 3.4 0 1 0 0 4.8 3.4 3.4 0 1 0 0-4.8Z" />
      <path d="M9.4 12a3.4 3.4 0 1 0-4.8 0 3.4 3.4 0 1 0 4.8 0Z" />
      <path d="M14.6 12a3.4 3.4 0 1 1 4.8 0 3.4 3.4 0 1 1-4.8 0Z" />
    </Svg>
  );
}
