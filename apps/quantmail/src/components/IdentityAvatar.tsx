'use client';

/**
 * Deterministic gradient avatar for a person/address — same visual language as
 * the sidebar AccountBadge, so identities feel consistent across the app.
 */

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 95) % 360; // Wider rotation for better distinctiveness
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Single name: use first two chars for better differentiation
  const single = parts[0] || name;
  return (single.length >= 2 ? single.slice(0, 2) : single[0] || '?').toUpperCase();
}

const SIZES: Record<string, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

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
  const seed = name || '?';

  // If we have an image URL (gravatar, uploaded photo), show it
  if (imageUrl) {
    return (
      <span
        className={`flex flex-none items-center justify-center rounded-full overflow-hidden ${SIZES[size]} ${showRing ? 'ring-2 ring-[var(--quant-border)]' : ''} ${className}`}
        aria-hidden="true"
      >
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-semibold text-white shadow-sm ${SIZES[size]} ${showRing ? 'ring-2 ring-[rgba(255,255,255,0.08)]' : ''} ${className}`}
      style={{ background: gradientFor(seed) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
