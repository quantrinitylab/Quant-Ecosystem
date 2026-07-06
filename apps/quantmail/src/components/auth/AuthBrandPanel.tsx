'use client';

/**
 * Immersive brand panel for the auth split-screen. Deep gradient canvas with
 * soft floating orbs, the QuantMail mark/wordmark, a headline, and a compact
 * feature list conveying the "unified identity" pitch. Pure CSS/SVG — no assets.
 */
export function AuthBrandPanel({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="relative h-full w-full">
      {/* Gradient canvas */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 120% at 0% 0%, #4F46E5 0%, #6D28D9 38%, #1E1B4B 78%, #0B0A1F 100%)',
        }}
      />
      {/* Floating orbs */}
      <div
        className="absolute -top-24 -left-16 h-80 w-80 rounded-full opacity-40 blur-3xl animate-pulse-brand"
        style={{ background: 'radial-gradient(circle, #818CF8 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-6rem] right-[-4rem] h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }}
      />
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16 text-white">
        <div className="flex items-center gap-3">
          <QuantMark />
          <span className="text-lg font-semibold tracking-tight">QuantMail</span>
        </div>

        <div className="max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">{eyebrow}</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight xl:text-[2.75rem]">
            {title}
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">{subtitle}</p>

          <ul className="mt-9 space-y-3.5">
            {[
              ['Mail', 'Gmail-class inbox, threads, labels & AI compose'],
              ['Code', 'Repos, reviews & pipelines — GitHub inside your inbox'],
              ['AI', 'QuantAI operates it all on your behalf'],
            ].map(([k, v]) => (
              <li key={k} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md bg-white/12 text-[11px] font-semibold text-white/90 ring-1 ring-white/15">
                  {k[0]}
                </span>
                <span className="text-sm text-white/75">
                  <span className="font-medium text-white/90">{k}</span> — {v}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">One account. Every tool. © Quant Ecosystem</p>
      </div>
    </div>
  );
}

function QuantMark() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2.2" opacity="0.95" />
        <path d="M15.5 15.5L20 20" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
