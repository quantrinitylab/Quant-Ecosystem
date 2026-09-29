import {
  Globe,
  Users,
  ShieldAlert,
  Search,
  Smartphone,
  Scale,
  type LucideIcon,
} from 'lucide-react';

interface Pillar {
  icon: LucideIcon;
  title: string;
  href: string;
  description: string;
}

const PILLARS: Pillar[] = [
  {
    icon: Globe,
    title: 'Domains & DNS Hub',
    href: '/domains',
    description:
      'Visual DNS verification wizard: TXT tokens, MX routing, SPF, DKIM, DMARC, BIMI and VMC.',
  },
  {
    icon: Users,
    title: 'Directory & Identity',
    href: '/directory',
    description:
      'Organizational units, SCIM 2.0 provisioning for Okta and Azure AD, and SAML 2.0 SSO.',
  },
  {
    icon: ShieldAlert,
    title: 'Compliance & Mail Routing',
    href: '/compliance',
    description: 'DLP regex rules, mandatory corporate disclaimers, and quarantine review escrow.',
  },
  {
    icon: Search,
    title: 'Security & Investigation',
    href: '/security',
    description:
      'Cross-service audit log explorer, SIEM webhook export, and one-click account lock.',
  },
  {
    icon: Smartphone,
    title: 'Device Management & MDM',
    href: '/devices',
    description:
      'Device enrollment inventory, security posture compliance, and remote corporate wipe.',
  },
  {
    icon: Scale,
    title: 'eDiscovery & Legal Hold',
    href: '/ediscovery',
    description:
      'Custodian litigation holds and court-admissible MBOX/PST export with SHA-256 manifests.',
  },
];

export default function AdminConsoleHome() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          Quant Ecosystem
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Enterprise Admin Console
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Dedicated multi-tenant administration platform for corporate organizations. The surfaces
          below are being built out incrementally.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <li
              key={pillar.href}
              className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{pillar.title}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {pillar.description}
              </p>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
