/*
 * QuantMailLogoStatic — the zero-JS SVG twin of the canvas QuantMailLogo.
 * Its geometry is derived bezier-for-bezier from QuantMailLogo's own
 * markMPath (the sanctioned "SVG matches the Canvas-2D M-mark design" brand
 * lock; BrandLoader ships the same mark on the splash loader). The canvas
 * QuantMailLogo is interactive-only: it pulls the marks/living-logo pipeline
 * plus a rAF repaint loop into the bundle, and paints nothing until its
 * first frame — pointless for a signed-out lockup that can never animate.
 * Do NOT swap this back to QuantMailLogo.
 *
 * The wordmark beside the mark is BrandWordmarkVector (fix/qm-brandwordmark-
 * vector-r5, re-attempt of #1708): pure SVG paths, no font-rendered text —
 * the signed-out lockup is a vector logo now, not words standing in as half
 * of one. The in-app text BrandWordmark is deliberately NOT used here; see
 * that file's header for the scope note.
 */
import { QuantMailLogoStatic } from '../QuantMailLogoStatic';
import { BrandWordmarkVector, BrandBylineVector } from '../BrandWordmarkVector';
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
      {/*
        No green glow here, on purpose (queue 2026-10-12 P2 [darkui-audit]
        /privacy emerald leak): Mail surfaces use orange ONLY, and this panel
        renders on /privacy via AuthShell's mobile + desktop brand slots. A
        `auth-brand-glow-green` div used to sit here; the class has no CSS
        rule today, but the name alone re-invites a green paint server the
        moment any glow stylesheet lands. Do not re-add it.
      */}

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
            {/*
              Copy-honesty note (2026-10-13): keep this card in sync with the
              privacy policy's §3A (src/app/privacy/page.tsx). AI triage reads
              message contents server-side (backend/services/ai-triage.service.ts
              → AIEngine.infer), so the policy qualifies its "does not
              read/index/parse" wording instead of this card over-promising.
            */}
            <FeatureCard
              icon={<QuantAiLogo size={34} />}
              title="AI triage"
              copy="Quant AI surfaces what's urgent and sums up long threads."
            />
            {/*
              Copy-honesty note (2026-10-12): claim only what is provable.
              - "Surfaces what's urgent": AI triage is shipped — ai-triage.service.ts
                passes the real From/Subject/Body into the server-side AIEngine
                (verified in PR #1080; provider default muse-spark-1.3).
              - "Sums up long threads": thread summarization is shipped and
                user-facing — ThreadSummaryCard (ConversationalThreadView.tsx)
                calls POST /api/ai/summarize-thread → AISummarizeService.
              - NOT claimed: AI reply drafting. POST /api/v1/ai/reply (AIReplyService)
                exists in the backend and a Next proxy route exists, but NO UI
                surface calls it — the composer's onAIAssist prop is never
                rendered by EmailComposer (dead plumbing), so "drafts the reply"
                is not a provable user-facing truth and was removed 2026-10-13.
              - In transit: nginx ingress forces TLS (ssl-redirect + force-ssl-redirect)
                and HSTS (max-age 31536000) — infra/helm/quant-platform/values-production.yaml,
                infra/k8s/ingress-quantmail.yaml; Cloudflare fronts the domain.
              - At rest: NOT claimed here. Terraform sets storage_encrypted=true
                (infra/terraform/modules/rds/main.tf:122) but the live staging RDS
                instance quant-staging-postgres reports StorageEncrypted=False
                (verified via boto3 describe-db-instances), so "at rest" is not a
                provable truth today and must not appear in user-facing copy.
            */}
            <FeatureCard
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                  <path d="M8 10.5 V7.5 a4 4 0 0 1 8 0 v3" />
                  <circle cx="12" cy="15.2" r="1.4" fill="currentColor" stroke="none" />
                </svg>
              }
              title="Encrypted in transit"
              copy="Your mail is encrypted between your device and our servers."
            />
          </div>
        </div>

        <footer>
          {/*
            Copy-honesty note (2026-10-26): "selected", not "all". QuantMail
            is the SSO root (ticket mint/resolve routes) and QuantAI consumes
            tickets (apps/quantai sso-ticket-client), but there is no live
            end-to-end SSO proof per app for all 8 Quant apps — only code
            wiring. The absolute all-apps claim was removed per the
            provable-truth rule; restore "all" only once SSO is live-verified
            per app.
          */}
          <span>One identity. Access to selected Quant apps.</span>
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
       * `aria-hidden` and the logo a decorative SVG (QuantMailLogoStatic
       * renders aria-hidden when it gets no title), the brand on the
       * signed-out screen had no accessible name at all. As an image, the
       * lockup announces once and its decorative parts stay silent.
       */
      role="img"
      className="auth-brand-lockup flex items-center gap-3"
      aria-label={quantMailAuthLockup.accessibleName}
    >
      <QuantMailLogoStatic size={compact ? 32 : 40} />
      <div className="flex flex-col" aria-hidden="true">
        <BrandWordmarkVector app="mail" fontSize={compact ? 18 : 20} />
        <span className="auth-byline">
          <BrandBylineVector />
        </span>
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
