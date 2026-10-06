// ============================================================================
// Quanty Connectors — brand icon renderer (inline SVG, no external assets).
// ============================================================================

import React from 'react';

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" strokeWidth={2} />
      <circle cx="12" cy="12" r="4" strokeWidth={2} />
      <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StrokeIcon({ className, d }: { className?: string; d: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const STROKE_PATHS: Record<string, string> = {
  globe: 'M12 2a10 10 0 100 20 10 10 0 000-20zm7 6h-3a15.7 15.7 0 00-1.3-3.3A8.02 8.02 0 0119 8zM12 4a14 14 0 011.9 4H10A14 14 0 0112 4zM4.3 14h3.2a15 15 0 000 2H4.3a8 8 0 010-2zm.7-6h3a15.7 15.7 0 011.3-3.3A8.02 8.02 0 005 8zm1.5 4h3a15 15 0 000 2h-3a8 8 0 010-2zm4.5 8a14 14 0 01-1.9-4h3.8a14 14 0 01-1.9 4zm2.6-6h-3.2a15 15 0 010-2h3.2a15 15 0 010 2zm1.7 6.3A15.7 15.7 0 0016 16h3a8.02 8.02 0 01-4.3 4.3zM16.5 14h3.2a8 8 0 000-2h-3.2a15 15 0 010 2z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  slack:
    'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  contacts: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z',
  box: 'M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.3 7l8.7 5 8.7-5M12 22V12',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  asana: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  palette: 'M12 2a10 10 0 100 20 1.65 1.65 0 001.2-2.8 1.65 1.65 0 011.3-2.8H17a5 5 0 005-5V7a5 5 0 00-5-5h-5zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01M12 13.5h.01',
  figma: 'M5 2h5v5H7a2 2 0 01-2-2V2zm7 0h5v5h-5V2zM5 9h5v5H5V9zm7 0h5a2 2 0 012 2v1a2 2 0 01-2 2h-5V9zM5 16h5v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5zm7 0h2a2 2 0 012 2v1a2 2 0 01-2 2h-2v-5z',
  calendly: 'M8 2v4M16 2v4M3 9h18M12 13v6M9 16h6M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  linear: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
};

/** Brand tile colors per connector (Muse screenshot style: rounded brand tile). */
const TILE_STYLES: Record<string, string> = {
  globe: 'bg-zinc-800 text-zinc-100',
  mail: 'bg-zinc-800 text-emerald-400',
  github: 'bg-zinc-800 text-white',
  google: 'bg-white text-[#4285F4]',
  instagram: 'bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white',
  slack: 'bg-zinc-800 text-amber-400',
  asana: 'bg-[#f06a6a]/15 text-[#f06a6a]',
  box: 'bg-[#0061d5]/15 text-[#4d9fff]',
  calendly: 'bg-[#006bff]/15 text-[#4d94ff]',
  canva: 'bg-[#00c4cc]/15 text-[#00c4cc]',
  linear: 'bg-[#5e6ad2]/15 text-[#8b93e8]',
  spotify: 'bg-[#1db954]/15 text-[#1db954]',
  figma: 'bg-[#a259ff]/15 text-[#a259ff]',
  calendar: 'bg-zinc-800 text-zinc-100',
  contacts: 'bg-zinc-800 text-zinc-100',
  phone: 'bg-zinc-800 text-zinc-100',
};

export function ConnectorIcon({ icon, size = 'md' }: { icon: string; size?: 'sm' | 'md' | 'lg' }) {
  const tileSize = size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-14 h-14' : 'w-11 h-11';
  const glyphSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
  const tile = TILE_STYLES[icon] ?? 'bg-zinc-800 text-zinc-200';

  let glyph: React.ReactNode;
  if (icon === 'github') glyph = <GithubIcon className={glyphSize} />;
  else if (icon === 'google') glyph = <GoogleIcon className={glyphSize} />;
  else if (icon === 'instagram') glyph = <InstagramIcon className={glyphSize} />;
  else if (icon === 'slack')
    glyph = (
      <svg className={glyphSize} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d={STROKE_PATHS.slack} />
      </svg>
    );
  else if (STROKE_PATHS[icon]) glyph = <StrokeIcon className={glyphSize} d={STROKE_PATHS[icon]} />;
  else glyph = <StrokeIcon className={glyphSize} d={STROKE_PATHS.globe} />;

  return (
    <div
      className={`${tileSize} ${tile} rounded-2xl flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {glyph}
    </div>
  );
}
