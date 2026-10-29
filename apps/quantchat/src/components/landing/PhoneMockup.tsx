// ============================================================================
// QuantChat — Phase 0 landing: CSS-only phone illustrations
// ============================================================================
//
// Original Quant design-system illustrations for the public homepage. Every
// mockup is pure CSS/SVG — no screenshots, no real user data, no
// third-party branding or imagery. Only --quant-* design tokens are used,
// so the illustrations follow the site's theme. Each mockup is exposed as
// role="img" with an aria-label for screen readers.
'use client';

import type { ReactNode } from 'react';

function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto h-[400px] w-[200px] overflow-hidden rounded-[2.5rem] bg-[var(--quant-card)] shadow-2xl"
      style={{ border: '1px solid var(--quant-border)' }}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-2.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black/70" />
      {children}
    </div>
  );
}

/** Abstract geometric "person" — a circle head + rounded shoulders. */
function Silhouette({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`} aria-hidden="true">
      <div
        className="h-12 w-12 rounded-full"
        style={{ background: 'var(--quant-muted-foreground)', opacity: 0.55 }}
      />
      <div
        className="-mt-1 h-14 w-24 rounded-t-full"
        style={{ background: 'var(--quant-muted-foreground)', opacity: 0.35 }}
      />
    </div>
  );
}

function ClockIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function PhoneIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.85 21 3 13.15 3 3.5a1 1 0 0 1 1-1H7.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 1. Camera — full-screen viewfinder, minimal chrome, bottom capture control
// ---------------------------------------------------------------------------
export function CameraMockup() {
  return (
    <PhoneFrame label="Illustration of the QuantChat camera with capture controls">
      {/* Viewfinder: dark abstract gradient scene */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 32%, var(--quant-primary) 0%, transparent 55%), linear-gradient(165deg, var(--quant-text) 0%, #020617 100%)',
        }}
      />
      {/* Subject */}
      <div className="absolute inset-x-0 top-[26%] flex justify-center">
        <Silhouette />
      </div>
      {/* Focus frame */}
      <div
        className="absolute left-1/2 top-[24%] h-28 w-28 -translate-x-1/2 rounded-xl"
        style={{ border: '2px dashed rgba(255,255,255,0.45)' }}
        aria-hidden="true"
      />
      {/* Top chrome */}
      <div className="absolute inset-x-0 top-9 z-10 flex items-center justify-between px-5 text-white/90" aria-hidden="true">
        <span className="text-xs font-semibold tracking-wide">9:41</span>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11Z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>
      {/* Right tool rail */}
      <div className="absolute right-3 top-1/3 z-10 flex flex-col items-center gap-4 text-white/80" aria-hidden="true">
        <span className="rounded-md bg-black/40 px-1.5 py-1 text-[9px] font-semibold">TIMER</span>
        <span className="rounded-md bg-black/40 px-1.5 py-1 text-[9px] font-semibold">GRID</span>
      </div>
      {/* Bottom capture cluster */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-6 pb-7 pt-10" aria-hidden="true">
        <div
          className="h-9 w-9 rounded-lg"
          style={{ background: 'linear-gradient(135deg, var(--quant-primary), var(--quant-secondary))' }}
        />
        <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-white">
          <div className="h-12 w-12 rounded-full bg-white" />
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white">
          FX
        </div>
      </div>
    </PhoneFrame>
  );
}

// ---------------------------------------------------------------------------
// 2. Chat — conversation with a disappearing-message timer chip
// ---------------------------------------------------------------------------
export function ChatMockup() {
  return (
    <PhoneFrame label="Illustration of a QuantChat conversation with a disappearing message timer">
      <div className="flex h-full flex-col bg-[var(--quant-background)] pt-10">
        {/* Thread header */}
        <div className="flex items-center gap-2.5 px-4 pb-3" style={{ borderBottom: '1px solid var(--quant-border)' }} aria-hidden="true">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--quant-primary), var(--quant-secondary))' }}
          >
            M
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight text-[var(--quant-foreground)]">Maya</p>
            <p className="flex items-center gap-1 text-[10px] text-[var(--quant-success)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--quant-success)]" />
              online
            </p>
          </div>
        </div>
        {/* Messages (fictional placeholder conversation) */}
        <div className="flex flex-1 flex-col gap-2 px-4 py-4" aria-hidden="true">
          <div className="max-w-[75%] self-start rounded-2xl rounded-bl-md bg-[var(--quant-muted)] px-3 py-2 text-[12px] text-[var(--quant-foreground)]">
            Movie night this weekend?
          </div>
          <div className="max-w-[75%] self-end rounded-2xl rounded-br-md bg-[var(--quant-primary)] px-3 py-2 text-[12px] font-medium text-white">
            Saturday works — I&apos;ll bring snacks
          </div>
          {/* Disappearing message with visible timer */}
          <div className="max-w-[80%] self-end">
            <div className="rounded-2xl rounded-br-md bg-[var(--quant-secondary)] px-3 py-2 text-[12px] font-medium text-white">
              Quick preview of the poster…
            </div>
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-[var(--quant-warning)]">
              <ClockIcon />
              disappears in 10s
            </div>
          </div>
          <div className="max-w-[75%] self-start rounded-2xl rounded-bl-md bg-[var(--quant-muted)] px-3 py-2 text-[12px] text-[var(--quant-foreground)]">
            Can&apos;t wait 🎬
          </div>
        </div>
        {/* Composer */}
        <div className="flex items-center gap-2 px-4 pb-6 pt-2" aria-hidden="true">
          <div className="h-9 flex-1 rounded-full bg-[var(--quant-muted)] px-4 text-[12px] leading-9 text-[var(--quant-muted-foreground)]">
            Message…
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--quant-primary)] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
            </svg>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ---------------------------------------------------------------------------
// 3. Stories — full-screen viewer with progress segments and reply field
// ---------------------------------------------------------------------------
export function StoriesMockup() {
  return (
    <PhoneFrame label="Illustration of the QuantChat stories viewer">
      <div
        className="relative flex h-full flex-col pt-10"
        style={{
          background:
            'radial-gradient(circle at 70% 20%, var(--quant-secondary) 0%, transparent 50%), linear-gradient(180deg, var(--quant-text) 0%, #020617 100%)',
        }}
      >
        {/* Progress segments */}
        <div className="flex gap-1 px-3 pt-1" aria-hidden="true">
          <div className="h-1 flex-1 rounded-full bg-white" />
          <div className="h-1 flex-1 rounded-full bg-white/90" style={{ width: '40%' }} />
          <div className="h-1 flex-1 rounded-full bg-white/25" />
        </div>
        {/* Creator row */}
        <div className="flex items-center gap-2 px-4 pt-3" aria-hidden="true">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full p-[2px]"
            style={{ background: 'linear-gradient(135deg, var(--quant-primary), var(--quant-secondary))' }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-black/60 text-[11px] font-bold text-white">
              D
            </div>
          </div>
          <p className="text-[12px] font-semibold text-white">Dev</p>
          <p className="text-[10px] text-white/60">2h</p>
        </div>
        {/* Scene: abstract sun + hills */}
        <div className="relative flex-1" aria-hidden="true">
          <div
            className="absolute left-1/2 top-[18%] h-16 w-16 -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--quant-warning) 0%, transparent 70%)' }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-24"
            style={{
              background: 'linear-gradient(180deg, transparent, var(--quant-primary))',
              opacity: 0.5,
              borderTopLeftRadius: '50% 100%',
              borderTopRightRadius: '50% 100%',
            }}
          />
        </div>
        {/* Caption + reply field */}
        <div className="px-4 pb-6" aria-hidden="true">
          <p className="mb-2 text-[12px] font-medium text-white">Sunset from the rooftop 🌇</p>
          <div className="flex items-center gap-2">
            <div className="h-9 flex-1 rounded-full border border-white/40 px-4 text-[12px] leading-9 text-white/80">
              Reply to Dev…
            </div>
            <div className="flex h-9 w-9 items-center justify-center text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

// ---------------------------------------------------------------------------
// 4. Call — incoming call card with accept / decline
// ---------------------------------------------------------------------------
export function CallMockup() {
  return (
    <PhoneFrame label="Illustration of an incoming QuantChat call">
      <div
        className="flex h-full flex-col items-center px-6 pt-16"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, var(--quant-primary) 0%, transparent 45%), linear-gradient(180deg, var(--quant-text) 0%, #020617 100%)',
        }}
      >
        {/* Avatar */}
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white ring-4 ring-white/20"
          style={{ background: 'linear-gradient(135deg, var(--quant-primary), var(--quant-secondary))' }}
          aria-hidden="true"
        >
          A
        </div>
        <p className="mt-4 text-[15px] font-semibold text-white">Arjun</p>
        <p className="mt-1 text-[12px] text-white/60">Incoming video call…</p>
        {/* Pulsing rings */}
        <div className="mt-6 flex items-center justify-center" aria-hidden="true">
          <div className="h-24 w-24 animate-ping rounded-full" style={{ background: 'var(--quant-primary)', opacity: 0.15 }} />
        </div>
        {/* Accept / decline */}
        <div className="mt-auto flex w-full items-center justify-between px-4 pb-8" aria-hidden="true">
          <div className="flex h-14 w-14 rotate-[135deg] items-center justify-center rounded-full bg-[var(--quant-destructive)] text-white shadow-lg">
            <PhoneIcon />
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--quant-success)] text-white shadow-lg">
            <PhoneIcon />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
