import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// The component imports Avatar from @quant/shared-ui; Avatar is irrelevant to
// the grouping assertions, and the shared-ui barrel pulls the whole component
// tree (fine in CI where deps are installed). Stub it to keep this test
// focused on the company-grouping behavior.
vi.mock('@quant/shared-ui', () => ({
  Avatar: ({ children, className }: any) =>
    React.createElement('div', { className }, children),
}));

import { CompaniesSubView } from '../app/contacts/components/ContactsSubViews';

/**
 * Regression: CompaniesSubView used to hardcode 6 company profiles
 * (Alphabet Inc., Microsoft Corp., Linux Foundation, Quant Trinity Lab,
 * OpenAI, Enterprise Cloud Inc) with invented HQ location + email-domain
 * metadata, and its header claimed "Corporate domain directories mapped to
 * verified sovereign tenants". Fix: company groups are derived ONLY from the
 * user's own contact `company` fields; the subtitle is the most common email
 * domain among that group's members; the "verified sovereign tenants" claim
 * is gone.
 */
describe('CompaniesSubView derives companies only from contact data', () => {
  const noop = () => {};
  const render = (contacts: any[]) =>
    renderToStaticMarkup(
      React.createElement(CompaniesSubView, {
        contacts,
        onInspect: noop,
        onCall: noop,
        onEmail: noop,
      }),
    );

  it('shows a company not on the old hardcoded list (data-driven, not seeded)', () => {
    const html = render([
      { id: '1', name: 'Ada Lovelace', email: 'ada@acme-corp.example', company: 'Acme Corp' },
      { id: '2', name: 'Grace Hopper', email: 'grace@acme-corp.example', company: 'Acme Corp' },
    ]);
    expect(html).toContain('Acme Corp');
    expect(html).toContain('2 members');
    // No invented HQ/location metadata may appear.
    expect(html).not.toMatch(/Mountain View|Redmond|San Francisco|Bengaluru/);
    // No hardcoded seed company may appear when no contact mentions it.
    expect(html).not.toMatch(/Alphabet Inc\.|Microsoft Corp\.|Linux Foundation|OpenAI|Enterprise Cloud/);
  });

  it('derives the subtitle from the members\' real email domains', () => {
    const html = render([
      { id: '1', name: 'Ada Lovelace', email: 'ada@acme-corp.example', company: 'Acme Corp' },
      { id: '2', name: 'Grace Hopper', email: 'grace@acme-corp.example', company: 'Acme Corp' },
    ]);
    expect(html).toContain('@acme-corp.example');
  });

  it('groups case-insensitively and drops contacts without a company', () => {
    const html = render([
      { id: '1', name: 'Ada Lovelace', email: 'ada@acme-corp.example', company: 'Acme Corp' },
      { id: '2', name: 'Alan Turing', email: 'alan@acme-corp.example', company: 'ACME CORP' },
      { id: '3', name: 'Linus Torvalds', email: 'linus@linux.org', company: 'Linux Foundation' },
      { id: '4', name: 'No Company', email: 'solo@example.org' },
    ]);
    expect(html).toContain('Acme Corp');
    expect(html).toContain('2 members'); // Ada + Alan merged into one card
    expect(html).toContain('Linux Foundation');
    expect(html).toContain('1 member');
    expect(html).not.toContain('No Company');
  });

  it('has no "verified sovereign tenants" claim anywhere', () => {
    const html = render([
      { id: '1', name: 'Ada Lovelace', email: 'ada@acme-corp.example', company: 'Acme Corp' },
    ]);
    expect(html).not.toMatch(/verified sovereign tenants/i);
    expect(html).not.toMatch(/Corporate domain directories/i);
  });

  it('shows an honest empty state when no contact has a company', () => {
    const html = render([
      { id: '1', name: 'Solo Person', email: 'solo@example.org' },
    ]);
    expect(html).toContain('No company data yet');
    expect(html).not.toMatch(/COMPANIES/);
  });

  it('never invents a role label for contacts without one', () => {
    const html = render([
      { id: '1', name: 'Ada Lovelace', email: 'ada@acme-corp.example', company: 'Acme Corp' },
    ]);
    expect(html).not.toContain('Team Member');
    expect(html).toContain('Ada Lovelace');
  });
});
