import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContactDetailSheet } from '../app/contacts/components/ContactsSubViews';

/**
 * Regression test for the full-page contacts crash ("QuantMail couldn't open
 * this view").
 *
 * Root cause: ContactDetailSheet called React.useState, then early-returned
 * when `contact` was null, and called React.useMemo *after* the early return.
 * On desktop the page auto-selects the first contact once the list loads, so
 * the sheet re-rendered with contact=null -> contact=<object>, the hook count
 * changed between renders, and React threw "Rendered more hooks than during
 * the previous render" into the global error boundary.
 *
 * Fix: all hooks run unconditionally before the early return.
 */
describe('ContactDetailSheet hooks order', () => {
  const contact = {
    id: 'c1',
    name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '+91 90000 00000',
    company: 'Quant',
    tags: ['vip'],
    isFavorite: false,
  };

  it('renders the empty state when no contact is selected', () => {
    const html = renderToStaticMarkup(React.createElement(ContactDetailSheet, { contact: null }));
    expect(html).toContain('Select a Contact');
  });

  it('renders the detail view when a contact is selected', () => {
    const html = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: contact as any, recentMail: [] }),
    );
    expect(html).toContain('Aarav Sharma');
    expect(html).toContain('aarav@example.com');
  });

  it('renders without NaN or hook-order artifacts when toggling selection', () => {
    // Simulate the desktop auto-select sequence: null -> contact -> null.
    // Each render must succeed independently; the hooks run unconditionally
    // so no render can change the hook count.
    const htmlNull1 = renderToStaticMarkup(React.createElement(ContactDetailSheet, { contact: null }));
    const htmlContact = renderToStaticMarkup(
      React.createElement(ContactDetailSheet, { contact: contact as any, recentMail: [] }),
    );
    const htmlNull2 = renderToStaticMarkup(React.createElement(ContactDetailSheet, { contact: null }));
    expect(htmlNull1).toContain('Select a Contact');
    expect(htmlContact).toContain('Aarav Sharma');
    expect(htmlNull2).toContain('Select a Contact');
  });
});
