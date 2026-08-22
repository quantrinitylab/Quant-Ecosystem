'use client';

/**
 * Deterministic gradient avatar for a person/address — same visual language as
 * the sidebar AccountBadge, so identities feel consistent across the app.
 *
 * If the caller has no name/email to resolve (passes null, undefined, empty, or
 * the sentinel '?'), we render a generic person silhouette instead of a literal
 * question-mark character so the UI never looks broken.
 */

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 95) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .trim()
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const first = parts[0] || name.trim();
  return (first[0] || '').toUpperCase();
}

/** True when the name cannot be resolved to a real identity or is unknown. */
function isUnknown(name: string | null | undefined): boolean {
  if (!name) return true;
  const t = name.trim().toLowerCase();
  return (
    t === '' ||
    t === '?' ||
    t === 'undefined' ||
    t === 'null' ||
    t === 'un' ||
    t === 'unknown' ||
    t === 'unknown sender' ||
    t === 'user'
  );
}

const SIZES: Record<string, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

/** Generic sleek person silhouette SVG — Instagram / iOS Contacts style */
function UnknownPersonIcon({ sizeClass }: { sizeClass: string }) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full bg-zinc-800/90 border border-zinc-700/60 shadow-inner ${sizeClass}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[62%] w-[62%] text-zinc-400">
        <path
          fillRule="evenodd"
          d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

export function IdentityAvatar({
  name,
  size = 'md',
  imageUrl,
  showRing = false,
  className = '',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  imageUrl?: string | null;
  showRing?: boolean;
  className?: string;
}) {
  const sizeClass = SIZES[size];

  if (isUnknown(name)) {
    return <UnknownPersonIcon sizeClass={`${sizeClass} ${className}`} />;
  }

  if (imageUrl) {
    return (
      <span
        className={`flex flex-none items-center justify-center rounded-full overflow-hidden ${sizeClass} ${
          showRing ? 'ring-2 ring-[var(--quant-border)]' : ''
        } ${className}`}
        aria-hidden="true"
      >
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-semibold text-white shadow-sm ${sizeClass} ${
        showRing ? 'ring-2 ring-[rgba(255,255,255,0.08)]' : ''
      } ${className}`}
      style={{ background: gradientFor(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
