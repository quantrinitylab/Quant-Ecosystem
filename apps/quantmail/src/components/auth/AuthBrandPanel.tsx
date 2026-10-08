import { BubbleAvatar } from '@quant/shared-ui';
import { BrandWordmark } from '../BrandWordmark';
import { QuantAiLogo } from '../QuantAiLogo';
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

          <div className="auth-feature-cards">
            <FeatureCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                  <path d="M3.5 7.5 L12 13 L20.5 7.5" />
                </svg>
              }
              title="Mail + chat threads"
              copy="Email and chat in one thread."
            />
            <FeatureCard
              icon={<QuantAiLogo size={34} />}
              title="AI triage"
              copy="Quant AI surfaces what's urgent and drafts the reply."
            />
            <FeatureCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                  <path d="M8 10.5 V7.5 a4 4 0 0 1 8 0 v3" />
                  <circle cx="12" cy="15.2" r="1.4" fill="currentColor" stroke="none" />
                </svg>
              }
              title="Encrypted in transit and at rest"
              copy="Your mail stays private."
            />
          </div>
        </div>

        <footer>
          <span>One identity. Access to all Quant apps.</span>
          <span>© 2026</span>
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
       * `aria-hidden` and the ghost avatar decorative here, the brand on the
       * signed-out screen had no accessible name at all. As an image, the
       * lockup announces once and its decorative parts stay silent.
       */
      role="img"
      className="auth-brand-lockup flex items-center gap-3"
      aria-label={quantMailAuthLockup.accessibleName}
    >
      {/*
        White Quanty ghost — the amber M-with-eyes canvas mark is retired from
        the signed-out brand lockup per the mascot migration (white ghost
        everywhere, amber must go). BubbleAvatar is DOM+CSS: it paints on first
        paint, unlike the canvas mark. aria-hidden here: the parent role="img"
        already carries the brand's accessible name.
      */}
      <span aria-hidden="true">
        <BubbleAvatar size={compact ? 32 : 40} state="idle" />
      </span>
      <div className="flex flex-col" aria-hidden="true">
        <BrandWordmark app="mail" size={compact ? 'text-lg' : 'text-xl'} />
        <span className="auth-byline">{quantMailAuthLockup.byline}</span>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="auth-feature-card">
      <span className="auth-feature-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
    </div>
  );
}
