'use client';

/**
 * Deterministic gradient avatar for a person/address — same visual language as
 * the sidebar AccountBadge, so identities feel consistent across the app.
 */

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (s || name[0] || '?').toUpperCase();
}

const SIZES: Record<string, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-12 w-12 text-base',
};

export function IdentityAvatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const seed = name || '?';
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-semibold text-white shadow-sm ${SIZES[size]} ${className}`}
      style={{ background: gradientFor(seed) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
