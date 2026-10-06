import type { ReactNode } from 'react';
import { QuantMailLogo } from '../QuantMailLogo';
import { BrandWordmark } from '../BrandWordmark';
import { Interactive3DLogo } from '../Interactive3DLogo';
import { quantMailAuthLockup } from './auth-brand-contract';

interface AuthBrandPanelProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export function AuthBrandPanel({ eyebrow, title, subtitle }: AuthBrandPanelProps) {
  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-grid" aria-hidden="true" />
      <div className="auth-brand-orbit auth-brand-orbit-one" aria-hidden="true" />
      <div className="auth-brand-orbit auth-brand-orbit-two" aria-hidden="true" />
      <div className="auth-brand-glow auth-brand-glow-saffron" aria-hidden="true" />
      <div className="auth-brand-glow auth-brand-glow-green" aria-hidden="true" />

      <div className="auth-mobile-brand">
        <BrandLockup compact />
      </div>

      <div className="auth-brand-desktop">
        <header>
          <BrandLockup />
        </header>

        <div className="auth-brand-content">
          <p className="auth-brand-eyebrow">
            <span /> {eyebrow}
          </p>
          <h2>{title}</h2>
          <p className="auth-brand-subtitle">{subtitle}</p>

          <div className="auth-feature-list" aria-label="QuantMail highlights">
            <FeatureCard
              title="Mail + chat threads"
              detail="Email and chat live in one thread. Reply in seconds, not days."
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              }
            />
            <FeatureCard
              title="AI triage"
              detail="Quant AI surfaces what is urgent and drafts the reply."
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                  <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
                </svg>
              }
            />
            <FeatureCard
              title="End-to-end encrypted"
              detail="Your mail, sealed. Only you hold the key."
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
            />
          </div>
        </div>

        <footer>
          <span>One identity. Every tool.</span>
          <span>Private by design · 2026</span>
        </footer>
      </div>
    </div>
  );
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div
      /*
       * `role="img"` because `aria-label` on a bare div is dropped — the generic
       * role does not take an author name. With the wordmark already
       * `aria-hidden` and the logo an unlabelled canvas, the brand on the
       * signed-out screen had no accessible name at all. As an image, the
       * lockup announces once and its decorative parts stay silent.
       */
      role="img"
      className="auth-brand-lockup flex items-center gap-3"
      aria-label={quantMailAuthLockup.accessibleName}
    >
      <QuantMailLogo size={compact ? 32 : 40} showBadge={false} interactive={false} />
      <div className="flex flex-col" aria-hidden="true">
        <BrandWordmark app="mail" size={compact ? 'text-lg' : 'text-xl'} />
        <span className="auth-byline">{quantMailAuthLockup.byline}</span>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="auth-feature-card">
      <span className="auth-feature-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
