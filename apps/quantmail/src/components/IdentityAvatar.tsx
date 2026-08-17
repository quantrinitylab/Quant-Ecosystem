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
    .split(/[.\s_-]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const single = parts[0] || name;
  return (single.length >= 2 ? single.slice(0, 2) : single[0] || '').toUpperCase();
}

/** True when the name cannot be resolved to a real identity. */
function isUnknown(name: string | null | undefined): boolean {
  if (!name) return true;
  const t = name.trim();
  return t === '' || t === '?' || t === 'undefined' || t === 'null';
}

const SIZES: Record<string, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

/** Generic person silhouette SVG — used when the identity is unresolved. */
function UnknownPersonIcon({ sizeClass }: { sizeClass: string }) {
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full bg-[var(--quant-muted)] ${sizeClass}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--quant-muted-foreground)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[55%] w-[55%]"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
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
