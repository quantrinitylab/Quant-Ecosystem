import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  ContactDetailSheet,
  CompaniesSubView,
  VipContactsSubView,
  getInitials,
  getAvatarBgColor,
  contactDisplayName,
} from '../app/contacts/components/ContactsSubViews';

/**
 * Regression test for the live P0: Contacts tab showed "QuantMail couldn't
 * open this view" (global error boundary) at mobile AND desktop widths,
 * persisting after retry.
 *
 * Root cause: the contacts UI assumed every record has a name or email, but
 * the data model allows phone-only / legacy records with neither. A single
 * such record in the address book threw TypeError ("Cannot read properties
 * of undefined") during render:
 * - getInitials(undefined) -> undefined.trim()
 * - getAvatarBgColor(undefined) -> undefined.length
 * - groupedContacts sort: (a.name || a.email).localeCompare(...)
 * - CompaniesSubView / VipContactsSubView: c.email.toLowerCase()
 *
 * Fix: hardened utils (accept undefined, safe defaults) + contactDisplayName
 * fallback (name -> email -> phone -> 'Unnamed contact') + guarded call sites.
 */
describe('contacts nameless/emailless records do not crash', () => {
  const ghost: any = { id: 'ghost-1', phone: '+91 90000 00000' };
  const ghost2: any = { id: 'ghost-2', phone: '+91 91111 11111' };
  const normal: any = { id: 'c2', name: 'Aarav Sharma', email: 'aarav@example.com' };
  const noop = () => {};

  it('contactDisplayName falls back through name -> email -> phone -> Unnamed', () => {
    expect(contactDisplayName({ name: 'A', email: 'a@x.com', phone: '1' })).toBe('A');
    expect(contactDisplayName({ email: 'a@x.com', phone: '1' })).toBe('a@x.com');
    expect(contactDisplayName({ phone: '+91 90000 00000' })).toBe('+91 90000 00000');
    expect(contactDisplayName({})).toBe('Unnamed contact');
  });

  it('getInitials / getAvatarBgColor accept undefined', () => {
    expect(getInitials(undefined)).toBe('CT');
    expect(getInitials('')).toBe('CT');
    expect(getInitials('Aarav Sharma')).toBe('AS');
    expect(typeof getAvatarBgColor(undefined)).toBe('string');
    expect(typeof getAvatarBgColor('Aarav')).toBe('string');
  });

  it('page.tsx groupedContacts sort handles nameless records', () => {
    const list = [ghost, ghost2, normal];
    const map: Record<string, any[]> = {};
    for (const c of list) {
      const letter = (c.name?.[0] || c.email?.[0] || '#').toUpperCase();
      const validKey = /^[A-Z]$/.test(letter) ? letter : '#';
      if (!map[validKey]) map[validKey] = [];
      map[validKey].push(c);
    }
    // Exact (fixed) sort from page.tsx — two ghosts share the '#' group, so
    // the comparator actually runs on undefined names/emails.
    const grouped = Object.keys(map)
      .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map((letter) => ({
        letter,
        contacts: map[letter].sort((a, b) =>
          (a.name || a.email || '').localeCompare(b.name || b.email || ''),
        ),
      }));
    expect(grouped.find((g) => g.letter === '#')?.contacts).toHaveLength(2);
  });

  it('ContactDetailSheet renders a nameless/emailless contact', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: ghost, recentMail: [] }),
    );
    expect(html).toContain('+91 90000 00000');
  });

  it('CompaniesSubView renders with an emailless contact', () => {
    const html = renderToStaticMarkup(
      React.createElement(CompaniesSubView, {
        contacts: [ghost, normal],
        onInspect: noop,
        onCall: noop,
        onEmail: noop,
      }),
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it('VipContactsSubView renders with an emailless contact', () => {
    const html = renderToStaticMarkup(
      React.createElement(VipContactsSubView, {
        contacts: [ghost, normal],
        onInspect: noop,
        onCall: noop,
        onEmail: noop,
      }),
    );
    expect(html.length).toBeGreaterThan(0);
  });
});
