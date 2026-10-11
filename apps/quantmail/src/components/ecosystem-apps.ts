// ============================================================================
// QuantMail — Ecosystem app directory (shared)
// ============================================================================
// The flagship switcher (DesktopAppRail on desktop, QuantPillarTopBar on
// mobile) covers the 5 in-product pillars (Mail/Calendar/Drive/Contacts/
// QuantGit). Sibling ecosystem apps live on their own production subdomains
// and are reached through the deliberate "More apps" overflow entry in each
// switcher — user-triggered only, never spontaneous.
//
// URLs below are the canonical production domains, verified against
// infra/k8s/app-routing-ingress.yaml (TLS hosts) and confirmed live by the
// 2026-10-11 customer audit (direct subdomain navigation works; the audit's
// phantom "More from QUANTRINITY" panel had no reproducible trigger because no
// such panel existed in code — this directory replaces it with an intentional
// one). Do NOT add an app here unless its production domain is verified live:
// an entry that 404s is fake data.
// ============================================================================

export interface EcosystemApp {
  id: 'quantchat' | 'quantai';
  label: string;
  /** One honest line about what the app is. */
  tagline: string;
  /** Canonical production URL (https, cross-origin — always open via <a>). */
  url: string;
}

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: 'quantchat',
    label: 'QuantChat',
    tagline: 'Messages, groups and calls',
    url: 'https://quantchat.quantrinity.in',
  },
  {
    id: 'quantai',
    label: 'QuantAI',
    tagline: 'Your AI assistant',
    url: 'https://quantai.quantrinity.in',
  },
];
