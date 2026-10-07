/**
 * Quant Documentation Site Configuration
 * Defines the navigation structure and metadata for the documentation site.
 */

export interface NavItem {
  title: string;
  path: string;
  children?: NavItem[];
}

export interface SiteConfig {
  title: string;
  description: string;
  baseUrl: string;
  navigation: NavItem[];
  footer: {
    links: { label: string; href: string }[];
    copyright: string;
  };
}

export const siteConfig: SiteConfig = {
  title: 'Quant Documentation',
  description: 'Official documentation for the Quant privacy-first productivity ecosystem.',
  baseUrl: 'https://docs.quant.app',
  navigation: [
    { title: 'Home', path: '/' },
    { title: 'Getting Started', path: '/getting-started' },
    {
      title: 'Guides',
      path: '/guides',
      children: [
        { title: 'Quickstart', path: '/guides/quickstart' },
        { title: 'Authentication', path: '/guides/authentication' },
        { title: 'AI Integration', path: '/guides/ai-integration' },
        { title: 'Real-Time Collaboration', path: '/guides/real-time' },
        { title: 'Deployment', path: '/guides/deployment' },
      ],
    },
    { title: 'API Reference', path: '/api-reference' },
    { title: 'Architecture', path: '/architecture' },
    {
      title: 'Help',
      path: '/help',
      children: [
        { title: 'FAQ', path: '/help/faq' },
        { title: 'Troubleshooting', path: '/help/troubleshooting' },
        { title: 'Account Management', path: '/help/account-management' },
        { title: 'Privacy & Security', path: '/help/privacy-security' },
      ],
    },
    {
      title: 'Community',
      path: '/community',
      children: [
        { title: 'Channels', path: '/community/channels' },
        { title: 'Contributing', path: '/community/contributing' },
        { title: 'Code of Conduct', path: '/community/code-of-conduct' },
        { title: 'Open Source Policy', path: '/community/open-source-policy' },
      ],
    },
  ],
  footer: {
    links: [
      { label: 'Status', href: 'https://status.quant.app' },
      { label: 'Blog', href: 'https://blog.quant.app' },
      { label: 'GitHub', href: 'https://github.com/quant-app' },
      { label: 'Discord', href: 'https://discord.gg/quant' },
    ],
    copyright: 'Quant. All rights reserved.',
  },
};
