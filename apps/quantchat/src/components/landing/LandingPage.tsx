// ============================================================================
// QuantChat — Phase 0 public homepage (signed-out landing)
// ============================================================================
//
// Shown to signed-out visitors at '/' (see page.tsx's RootGate). This is a
// marketing page with ZERO private data: every illustration is an original
// CSS-only mockup (components/landing/PhoneMockup.tsx), every name is
// fictional, and the privacy copy is deliberately honest — messages are
// stored on QuantChat servers in readable form today and end-to-end
// encryption is NOT enabled yet. Nothing here claims E2EE is live, and the
// download section names no store URLs until they are verified (TBD).
'use client';

import { motion } from 'framer-motion';
import { CameraMockup, ChatMockup, StoriesMockup, CallMockup } from './PhoneMockup';

// QuantMail SSO base URL (overridable per environment) — mirrors
// src/components/auth/LoginPage.tsx. Accounts are created on QuantMail.
const SSO_BASE_URL = process.env.NEXT_PUBLIC_QUANTMAIL_SSO_URL || 'https://quantmail.in';
export const REGISTER_URL = `${SSO_BASE_URL}/register`;

/** Original Quant brand mark: concentric beacon in Quant tokens. */
function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="21" stroke="var(--quant-primary)" strokeWidth="3" opacity="0.9" />
      <path
        d="M24 13 35 24 24 35 13 24Z"
        stroke="var(--quant-secondary)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="4.5" fill="var(--quant-primary)" />
    </svg>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, ease: 'easeOut' },
} as const;

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------
function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--quant-background)]/85 backdrop-blur-md" style={{ borderColor: 'var(--quant-border)' }}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Primary">
        <a href="/" className="flex items-center gap-2.5" aria-label="QuantChat home">
          <BrandMark />
          <span className="text-lg font-bold tracking-tight text-[var(--quant-foreground)]">QuantChat</span>
        </a>
        <div className="hidden items-center gap-7 text-sm font-medium text-[var(--quant-muted-foreground)] md:flex">
          <a href="#features" className="transition-colors hover:text-[var(--quant-foreground)]">Features</a>
          <a href="#privacy" className="transition-colors hover:text-[var(--quant-foreground)]">Privacy</a>
          <a href="#safety" className="transition-colors hover:text-[var(--quant-foreground)]">Safety</a>
          <a href="/support" className="transition-colors hover:text-[var(--quant-foreground)]">Support</a>
        </div>
        <a
          href="/login"
          className="rounded-xl bg-[var(--quant-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Sign in
        </a>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full blur-[130px]"
        style={{ background: 'var(--quant-primary)', opacity: 0.14 }}
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:grid-cols-2 md:pt-20">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <span className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold text-[var(--quant-muted-foreground)]" style={{ borderColor: 'var(--quant-border)' }}>
            <span className="h-2 w-2 rounded-full bg-[var(--quant-primary)]" aria-hidden="true" />
            Camera-first messaging for the Quant Ecosystem
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-[var(--quant-foreground)] sm:text-5xl lg:text-6xl">
            Say it with the camera.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--quant-muted-foreground)] sm:text-lg">
            QuantChat is camera-first messaging: snap a moment, send it to friends, and keep the
            conversation moving — chats, disappearing snaps, stories, calls and rooms, all in one
            place.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--quant-muted-foreground)]">
            One Quant ID across every Quant app — sign in with your QuantMail account and
            you&apos;re in. No separate QuantChat password to remember.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--quant-primary)] px-7 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ boxShadow: '0 10px 30px -8px var(--quant-primary)' }}
            >
              Sign in
            </a>
            <a
              href={REGISTER_URL}
              className="inline-flex items-center justify-center rounded-xl border-2 px-7 py-3.5 text-base font-semibold text-[var(--quant-foreground)] transition-all hover:bg-[var(--quant-muted)] active:scale-[0.98]"
              style={{ borderColor: 'var(--quant-primary)' }}
            >
              Create account
            </a>
          </div>
          <p className="mt-4 text-xs text-[var(--quant-muted-foreground)]">
            Works on the web today — native mobile apps are on the way.
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
          className="flex justify-center"
        >
          <CameraMockup />
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature tour
// ---------------------------------------------------------------------------
function FeatureRow({
  flip = false,
  eyebrow,
  title,
  body,
  children,
}: {
  flip?: boolean;
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div {...fadeUp} className="grid items-center gap-10 md:grid-cols-2">
      <div className={flip ? 'md:order-2' : ''}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--quant-primary)]">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-[var(--quant-foreground)] sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-md leading-relaxed text-[var(--quant-muted-foreground)]">{body}</p>
      </div>
      <div className={flip ? 'md:order-1' : ''}>{children}</div>
    </motion.div>
  );
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      {...fadeUp}
      className="rounded-2xl bg-[var(--quant-card)] p-6 shadow-sm"
      style={{ border: '1px solid var(--quant-border)' }}
    >
      <h4 className="text-base font-bold text-[var(--quant-foreground)]">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--quant-muted-foreground)]">{body}</p>
    </motion.div>
  );
}

function FeatureTour() {
  return (
    <section id="features" className="scroll-mt-20 bg-[var(--quant-muted)]/60 py-20">
      <div className="mx-auto max-w-6xl space-y-20 px-4 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[var(--quant-foreground)] sm:text-4xl">
            Everything in one camera-first app
          </h2>
          <p className="mt-3 text-[var(--quant-muted-foreground)]">
            A tour of what QuantChat does — every illustration below is a mockup, not a screenshot.
          </p>
        </motion.div>

        <FeatureRow
          eyebrow="Capture"
          title="Open to the camera"
          body="Photo or video in one tap. Flip, flash and your most recent tools stay one reach away — the camera is the home screen, not a buried tab."
        >
          <CameraMockup />
        </FeatureRow>

        <FeatureRow
          flip
          eyebrow="Chat"
          title="Conversations that keep up"
          body="Fast, familiar chat with replies, reactions and delivery states for the everyday conversations — and a visible timer on anything set to disappear."
        >
          <ChatMockup />
        </FeatureRow>

        <FeatureRow
          eyebrow="Stories"
          title="Share your day"
          body="Post the day's moments to your story. Friends see them full-screen, can reply privately, and everything expires after 24 hours."
        >
          <StoriesMockup />
        </FeatureRow>

        <FeatureRow
          flip
          eyebrow="Calls"
          title="When typing won't do"
          body="One-tap voice and video calls, plus rooms where the whole group can hang out together."
        >
          <CallMockup />
        </FeatureRow>

        <div className="grid gap-5 md:grid-cols-2">
          <MiniCard
            title="Disappearing snaps"
            body="Send a snap that disappears after it's viewed — you'll always see the timer before you send. Disappearing is about expectations, not guarantees: we'll always show you who's seen what, and tell you plainly what we can't prevent."
          />
          <MiniCard
            title="Rooms for your people"
            body="Group chats and hangout rooms with the same disappearing-message controls as one-to-one chats. Make a room for the weekend plan, the study group, or just the group chat that never sleeps."
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Privacy — honest, never claims E2EE is live
// ---------------------------------------------------------------------------
function PrivacyCard({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      {...fadeUp}
      className="rounded-2xl bg-[var(--quant-card)] p-6 shadow-sm"
      style={{ border: '1px solid var(--quant-border)' }}
    >
      <h3 className="text-lg font-bold text-[var(--quant-foreground)]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--quant-muted-foreground)]">{body}</p>
    </motion.div>
  );
}

function PrivacySection() {
  return (
    <section id="privacy" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[var(--quant-foreground)] sm:text-4xl">
            Honest privacy, stated plainly
          </h2>
          <p className="mt-3 text-[var(--quant-muted-foreground)]">
            No fine print, no &ldquo;trust us&rdquo;. Here is exactly where things stand today.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <PrivacyCard
            title="How it works today"
            body="Messages are stored on QuantChat servers in readable form so we can deliver them across your devices. That means our servers can read message contents today — we're telling you up front instead of burying it in legalese."
          />
          <PrivacyCard
            title="End-to-end encryption: not enabled yet"
            body="End-to-end encryption is not enabled yet. When it is, only you and the people you message will be able to read your messages. We will not claim it until it is live and independently audited — nothing on this page claims otherwise."
          />
          <PrivacyCard
            title="The roadmap"
            body="One-to-one chats get end-to-end encryption first, then groups. The moment it's live and audited, we'll announce it here, in the app, and in our Privacy Policy — with the date, so you can hold us to it."
          />
        </div>
        <motion.p {...fadeUp} className="mt-8 text-center text-sm">
          <a href="/privacy" className="font-semibold text-[var(--quant-primary)] underline underline-offset-4 hover:brightness-110">
            Read the full Privacy Policy
          </a>
        </motion.p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------
function SafetySection() {
  const items = [
    {
      title: 'Report',
      body: 'Report a message, story or account in two taps. Every report is reviewed by a real person, and you will hear back about what we did.',
    },
    {
      title: 'Block',
      body: "Block anyone instantly — they can't message you, see your story, or find you in search. Unblock just as easily if you change your mind.",
    },
    {
      title: 'Your data',
      body: "Download a copy of everything we hold about you, any time, from Settings. It's your data — taking it with you should be one tap, not a support ticket.",
    },
    {
      title: 'A clean exit',
      body: 'Delete your account and its data whenever you want. No dark patterns, no retention maze, no guilt-trip screens.',
    },
  ];
  return (
    <section id="safety" className="scroll-mt-20 bg-[var(--quant-muted)]/60 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[var(--quant-foreground)] sm:text-4xl">
            Safety is part of the product
          </h2>
          <p className="mt-3 text-[var(--quant-muted-foreground)]">
            The controls are in the app where you need them — not hidden three menus deep.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <motion.div
              key={item.title}
              {...fadeUp}
              className="rounded-2xl bg-[var(--quant-card)] p-6 shadow-sm"
              style={{ border: '1px solid var(--quant-border)' }}
            >
              <h3 className="text-base font-bold text-[var(--quant-foreground)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--quant-muted-foreground)]">{item.body}</p>
            </motion.div>
          ))}
        </div>
        <motion.div {...fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="/terms" className="font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:text-[var(--quant-foreground)] hover:underline">Terms of Service</a>
          <a href="/privacy" className="font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:text-[var(--quant-foreground)] hover:underline">Privacy Policy</a>
          <a href="/support" className="font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:text-[var(--quant-foreground)] hover:underline">Support &amp; Safety Center</a>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Download — TBD: no store URLs are invented
// ---------------------------------------------------------------------------
function DownloadSection() {
  const btn =
    'inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border px-6 py-3.5 text-base font-semibold opacity-60';
  return (
    <section id="download" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <motion.div {...fadeUp}>
          <h2 className="text-3xl font-extrabold tracking-tight text-[var(--quant-foreground)] sm:text-4xl">
            Get QuantChat
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--quant-muted-foreground)]">
            Verified store links will appear here. Until then, QuantChat runs fully on the web —
            sign in and start chatting in your browser.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button type="button" disabled aria-disabled="true" title="Coming soon — link TBD" className={`${btn} border-[var(--quant-border)] bg-[var(--quant-card)] text-[var(--quant-foreground)]`}>
              App Store
              <span className="rounded-md bg-[var(--quant-warning)]/20 px-2 py-0.5 text-xs font-bold text-[var(--quant-warning)]">TBD</span>
            </button>
            <button type="button" disabled aria-disabled="true" title="Coming soon — link TBD" className={`${btn} border-[var(--quant-border)] bg-[var(--quant-card)] text-[var(--quant-foreground)]`}>
              Google Play
              <span className="rounded-md bg-[var(--quant-warning)]/20 px-2 py-0.5 text-xs font-bold text-[var(--quant-warning)]">TBD</span>
            </button>
          </div>
          <a
            href="/login"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[var(--quant-primary)] px-7 py-3.5 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Use QuantChat on the web
          </a>
          <p className="mx-auto mt-6 max-w-xl rounded-xl bg-[var(--quant-warning)]/10 px-4 py-3 text-left text-xs leading-relaxed text-[var(--quant-muted-foreground)]" style={{ border: '1px solid var(--quant-warning)' }}>
            <strong className="text-[var(--quant-foreground)]">A safety note:</strong> QuantChat will
            never ask you to install the app from a link sent by a stranger. Only trust download
            links published on this page.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer — repeats the privacy status honestly
// ---------------------------------------------------------------------------
function LandingFooter() {
  return (
    <footer className="border-t py-10" style={{ borderColor: 'var(--quant-border)' }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-7 w-7" />
          <span className="font-bold text-[var(--quant-foreground)]">QuantChat</span>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          QuantChat is part of the Quant Ecosystem. Messages are stored on QuantChat servers in
          readable form. End-to-end encryption is not enabled yet.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm" aria-label="Footer">
          <a href="/terms" className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]">Terms</a>
          <a href="/privacy" className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]">Privacy</a>
          <a href="/support" className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]">Support</a>
          <a href="/login" className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]">Sign in</a>
        </nav>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[var(--quant-background)] text-[var(--quant-foreground)] antialiased">
      <LandingNav />
      <main>
        <Hero />
        <FeatureTour />
        <PrivacySection />
        <SafetySection />
        <DownloadSection />
      </main>
      <LandingFooter />
    </div>
  );
}
