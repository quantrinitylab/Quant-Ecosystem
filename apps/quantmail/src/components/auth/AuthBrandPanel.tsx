import { QuantrinityMark } from '../QuantrinityMark';

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
        <span className="auth-country-pill">IN / GLOBAL</span>
      </div>

      <div className="auth-brand-desktop">
        <header>
          <BrandLockup />
          <span className="auth-country-pill">
            <i /> Built in India
          </span>
        </header>

        <div className="auth-brand-content">
          <p className="auth-brand-eyebrow">
            <span /> {eyebrow}
          </p>
          <h2>{title}</h2>
          <p className="auth-brand-subtitle">{subtitle}</p>

          <div className="auth-proof-card">
            <div className="auth-proof-topline">
              <div>
                <span className="auth-proof-pulse" />
                <strong>Morning signal</strong>
              </div>
              <span>QuantAI sorted</span>
            </div>
            <PreviewRow
              sender="Ananya · Product"
              subject="Launch brief is ready"
              detail="3 decisions, summarized for you"
              time="09:42"
              active
            />
            <PreviewRow
              sender="Rohan · Design"
              subject="Review: new identity system"
              detail="Commented on the infinity mark"
              time="08:16"
            />
            <PreviewRow
              sender="Calendar"
              subject="Founder review"
              detail="Today · 16:30 IST"
              time="Tue"
            />
            <div className="auth-proof-footer">
              <span>Mail</span>
              <span>Calendar</span>
              <span>Drive</span>
              <span>Code</span>
              <span>AI</span>
            </div>
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
    <div className="auth-brand-lockup">
      <QuantrinityMark compact={compact} />
      <div>
        <p>QuantMail</p>
        <span>by Quantrinity</span>
      </div>
    </div>
  );
}

function PreviewRow({
  sender,
  subject,
  detail,
  time,
  active = false,
}: {
  sender: string;
  subject: string;
  detail: string;
  time: string;
  active?: boolean;
}) {
  return (
    <div className={`auth-preview-row ${active ? 'is-active' : ''}`}>
      <span className="auth-preview-avatar" aria-hidden="true">
        {sender.charAt(0)}
      </span>
      <div>
        <strong>{sender}</strong>
        <p>
          {subject} <span>— {detail}</span>
        </p>
      </div>
      <time>{time}</time>
    </div>
  );
}
