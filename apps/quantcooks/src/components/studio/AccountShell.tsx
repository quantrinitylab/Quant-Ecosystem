// ============================================================================
// QuantCooks Studio — Account shell (checklist row #65, specs §10.1/§10.5)
//
// The studied manage-account shape: one surface, a left nav, every
// account subflow in-panel — Profile · Credits & Plan · Usage · Brand
// Defaults · Promocode · Danger Zone. Credits and Usage are their own
// components (CreditsPanel / UsagePanel) handed in by the page, which
// owns their data reads; the four panels built here follow the unit's
// honesty rules:
//  - Profile: the ONLY real identity fact the client holds is "a session
//    exists" (useAuth exposes nothing else — account.ts IDENTITY_VIEW).
//    Sign out is real and wired by the page. Everything else about the
//    caller's identity is an unavailable state with its follow-up named.
//  - Brand Defaults: the caller's real brand kits (the isDefault flag is
//    recorded on the kit itself) as a read view + the real /brand-kit
//    surface for changes. No invented account-level default setting.
//  - Promocode: no redemption service exists, so there is deliberately
//    NO code box — a form that submits nowhere is the fake this unit
//    refuses to ship.
//  - Danger Zone: deletion + cancellation with the plain consequences
//    stated BEFORE any confirm (specs §10.5), and both actions disabled
//    with their real reasons — deletion belongs to the Quant Account
//    identity service, and there is no paid plan to cancel yet.
// ============================================================================

import React, { useState } from 'react';
import {
  ACCOUNT_PANELS,
  IDENTITY_VIEW,
  type AccountPanelId,
} from '../../lib/studio/account';

/** The brand-kit fields this panel reads — a lite shape over the real kit. */
export interface BrandKitLite {
  id: string;
  name: string;
  isDefault: boolean;
}

export type BrandKitsState = 'loading' | 'error' | 'ready';

export interface AccountShellProps {
  /** Panel shown first (the page maps ?panel= onto this). */
  initialPanel?: AccountPanelId;
  /** Real session fact from useAuth — the only identity claim available. */
  signedIn: boolean;
  /** The real sign-out (useAuth().logout), wired by the page. */
  onSignOut?: () => void;
  brandKitsState: BrandKitsState;
  brandKitsError?: string | null;
  brandKits?: BrandKitLite[];
  /** CreditsPanel, rendered by the page. */
  creditsPanel: React.ReactNode;
  /** UsagePanel, rendered by the page (it owns the job-activity read). */
  usagePanel: React.ReactNode;
}

function ProfilePanel({ signedIn, onSignOut }: { signedIn: boolean; onSignOut?: () => void }) {
  return (
    <section className="studio-account-panel" data-testid="account-panel-profile">
      <h2>Profile</h2>
      <div data-testid="account-identity-unavailable">
        <p>{IDENTITY_VIEW.reason}</p>
      </div>
      <p data-testid="account-session-state">
        {signedIn
          ? 'You are signed in with your Quant Account. The same sign-in covers every Quant app — QuantCooks never keeps a separate password.'
          : 'You are not signed in. Projects and job activity on this device cannot be tied to your account until you sign in.'}
      </p>
      {signedIn && (
        <button type="button" onClick={onSignOut} data-testid="account-sign-out">
          Sign out
        </button>
      )}
      <p className="studio-account-note">
        Your public face — the profile other cooks can visit — is the Profile page. Its social
        layer (followers, featured project, publishing) is part of the community build (G-17) and
        is shown there in its honest state, not previewed here with invented numbers.
      </p>
    </section>
  );
}

function BrandDefaultsPanel({
  state,
  error,
  kits = [],
}: {
  state: BrandKitsState;
  error?: string | null;
  kits?: BrandKitLite[];
}) {
  return (
    <section className="studio-account-panel" data-testid="account-panel-brand-defaults">
      <h2>Brand Defaults</h2>
      <p>
        Your brand kits live on the <a href="/brand-kit">Brand Kit</a> page, and studios pull
        colours, fonts and logo rules from them. The default kit is recorded on the kit itself;
        this panel is a read view of that record.
      </p>
      {state === 'loading' && <p data-testid="brand-defaults-loading">Loading your brand kits…</p>}
      {state === 'error' && (
        <p data-testid="brand-defaults-error">
          Brand kits could not be loaded{error ? `: ${error}` : ''}.
        </p>
      )}
      {state === 'ready' && kits.length === 0 && (
        <p data-testid="brand-defaults-empty">
          No brand kits yet. Create one on the <a href="/brand-kit">Brand Kit</a> page and it will
          be listed here.
        </p>
      )}
      {state === 'ready' && kits.length > 0 && (
        <ul className="studio-account-kit-list" data-testid="brand-defaults-list">
          {kits.map((kit) => (
            <li key={kit.id}>
              {kit.name}
              {kit.isDefault ? (
                <span className="studio-account-kit-default" data-testid="brand-defaults-default">
                  {' '}
                  · Default
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="studio-account-note">
        To change which kit is the default, or to edit colours and fonts, use the Brand Kit page —
        this panel never edits the record it displays.
      </p>
    </section>
  );
}

function PromocodePanel() {
  return (
    <section className="studio-account-panel" data-testid="account-panel-promocode">
      <h2>Promocode</h2>
      <div data-testid="account-promocode-unavailable">
        <p>
          Promo codes cannot be redeemed yet. There is no redemption service behind this panel, so
          there is deliberately no code box here — a box that accepted a code and did nothing
          would be a fake. Redemption arrives with billing (CP-2), and this panel becomes the
          place to apply a code the moment a real service can honour it.
        </p>
      </div>
    </section>
  );
}

function DangerZonePanel() {
  return (
    <section className="studio-account-panel" data-testid="account-panel-danger-zone">
      <h2>Danger Zone</h2>

      <div className="studio-account-danger" data-testid="danger-cancel">
        <h3>Cancel plan</h3>
        <p>
          Plain consequences, stated before anything is confirmed: cancelling a plan would stop
          its renewal and, under the standing rules, your credits would still not expire — credits
          you hold are yours. Today there is no paid QuantCooks plan on this account to cancel:
          QuantCooks does not sell plans yet (they arrive with CP-2).
        </p>
        <button type="button" disabled data-testid="danger-cancel-disabled">
          Cancel plan
        </button>
        <p className="studio-account-note">Disabled because there is no plan to cancel.</p>
      </div>

      <div className="studio-account-danger" data-testid="danger-delete">
        <h3>Delete account</h3>
        <p>
          Plain consequences, stated before anything is confirmed: deleting your Quant Account
          would remove sign-in for every Quant app at once — mail, chat and this studio — and
          delete the projects, assets and personas held under it. It cannot be undone from inside
          QuantCooks.
        </p>
        <button type="button" disabled data-testid="danger-delete-disabled">
          Delete account
        </button>
        <p className="studio-account-note">
          Disabled here because account deletion is handled by the Quant Account identity service,
          not from inside an app — QuantCooks will deep-link to that flow when the identity
          surface exposes it, rather than pretending to delete anything itself.
        </p>
      </div>
    </section>
  );
}

export const AccountShell: React.FC<AccountShellProps> = ({
  initialPanel = 'profile',
  signedIn,
  onSignOut,
  brandKitsState,
  brandKitsError,
  brandKits = [],
  creditsPanel,
  usagePanel,
}) => {
  const [panel, setPanel] = useState<AccountPanelId>(initialPanel);

  return (
    <div className="studio-account" data-testid="account-shell">
      <nav className="studio-account-nav" aria-label="Account">
        <ul>
          {ACCOUNT_PANELS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-testid={`account-nav-${item.id}`}
                aria-current={panel === item.id ? 'page' : undefined}
                className={panel === item.id ? 'studio-account-nav-active' : undefined}
                onClick={() => setPanel(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="studio-account-main">
        {panel === 'profile' && <ProfilePanel signedIn={signedIn} onSignOut={onSignOut} />}
        {panel === 'credits' && creditsPanel}
        {panel === 'usage' && usagePanel}
        {panel === 'brand-defaults' && (
          <BrandDefaultsPanel state={brandKitsState} error={brandKitsError} kits={brandKits} />
        )}
        {panel === 'promocode' && <PromocodePanel />}
        {panel === 'danger-zone' && <DangerZonePanel />}
      </div>
    </div>
  );
};

export default AccountShell;
