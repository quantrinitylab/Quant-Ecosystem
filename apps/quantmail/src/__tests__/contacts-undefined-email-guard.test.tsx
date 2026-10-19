import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ContactDetailSheet } from '../app/contacts/components/ContactsSubViews';

/**
 * Regression tests: phone-only / legacy contacts whose `email` is undefined
 * must never produce "mailto:undefined" or "/compose?to=undefined" links,
 * and the Email/Message quick actions must be disabled (not dead clicks).
 *
 * The Contact frontend type declares email as required, but rows created
 * before validation and phone-only records exist at runtime with no email
 * (contactDisplayName already treats email as optional). Guarding is done at
 * render time: the Email Address row is omitted and both actions disabled.
 *
 * "Message" semantics remain a parked user decision — no chat routing is
 * invented here; Message keeps Email-identical behavior, guarded the same.
 */
describe('ContactDetailSheet undefined-email guards', () => {
  const phoneOnlyContact = {
    id: 'c-phone-only',
    name: 'Meera Nair',
    email: undefined,
    phone: '+91 98100 12345',
    company: 'Quant',
    tags: [],
    isFavorite: false,
  };

  const emailContact = {
    id: 'c-email',
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '+91 90000 00000',
    company: 'Quant',
    tags: ['vip'],
    isFavorite: false,
  };

  it('phone-only contact renders no mailto:undefined / compose?to=undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: phoneOnlyContact as any }),
    );
    expect(html).toContain('Meera Nair');
    expect(html).toContain('+91 98100 12345');
    expect(html).not.toContain('mailto:undefined');
    expect(html).not.toContain('compose?to=undefined');
    expect(html).not.toContain('undefined');
  });

  it('phone-only contact omits the Email Address row and its mailto anchor', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: phoneOnlyContact as any }),
    );
    // No mailto anchor at all, and no "Email Address" detail row.
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('Email Address');
  });

  it('phone-only contact disables the Email and Message quick actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: phoneOnlyContact as any }),
    );
    // Email + Message buttons are the only quick actions that need an email;
    // Call stays enabled (phone present). Both guarded buttons must carry
    // the disabled attribute (renderToStaticMarkup emits disabled="").
    const disabledCount = (html.match(/disabled=""/g) || []).length;
    expect(disabledCount).toBe(2);
    // Guarded labels stay visible so the sheet does not look broken.
    expect(html).toContain('Email');
    expect(html).toContain('Message');
    expect(html).toContain('Call');
  });

  it('contact with email renders the mailto anchor and enables Email/Message actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: emailContact as any }),
    );
    expect(html).toContain('href="mailto:aarav@example.com"');
    expect(html).toContain('Email Address');
    expect(html).not.toContain('disabled=""');
  });

  it('empty-string email is treated the same as a missing email', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, {
        contact: { ...phoneOnlyContact, email: '' } as any,
      }),
    );
    expect(html).not.toContain('mailto:undefined');
    expect(html).not.toContain('compose?to=undefined');
    expect(html).not.toContain('mailto:');
    const disabledCount = (html.match(/disabled=""/g) || []).length;
    expect(disabledCount).toBe(2);
  });
});
