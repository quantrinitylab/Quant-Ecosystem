// fix/qm-contacts-sender-hovercard — sender hovercard honesty contract.
//
// The card must show real contact data (or an honest "not in contacts"),
// wire Email/Schedule/Add-Edit to real QuantMail surfaces, and NEVER fake
// Chat/Video-call availability: those render disabled, labelled "not wired yet".

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SenderHovercardCard,
  matchSavedContact,
  senderContactHref,
  senderEmailHref,
} from '../components/SenderHovercard';
import type { Contact } from '../types';

function contact(partial: Partial<Contact>): Contact {
  return {
    id: 'c1',
    userId: 'u1',
    email: 'priya@example.com',
    name: 'Priya Sharma',
    tags: [],
    isFavorite: false,
    source: 'manual',
    syncedApps: [],
    ...partial,
  } as Contact;
}

describe('matchSavedContact', () => {
  it('matches on exact email, case-insensitively', () => {
    const list = [contact({ email: 'Priya@Example.com' }), contact({ id: 'c2', email: 'other@example.com' })];
    expect(matchSavedContact(list, 'priya@example.com')?.id).toBe('c1');
  });

  it('does not fuzzy-match a different address', () => {
    expect(matchSavedContact([contact({})], 'priya.sharma@example.com')).toBeNull();
    expect(matchSavedContact([], 'priya@example.com')).toBeNull();
    expect(matchSavedContact(null, 'priya@example.com')).toBeNull();
    expect(matchSavedContact([contact({})], '')).toBeNull();
  });
});

describe('senderEmailHref / senderContactHref', () => {
  it('builds a Re: compose link without duplicating Re:', () => {
    expect(senderEmailHref('a@b.com', 'Hello')).toContain('subject=Re%3A+Hello');
    expect(senderEmailHref('a@b.com', 'Re: Hello')).toContain('subject=Re%3A+Hello');
    expect(senderEmailHref('a@b.com', 'Re: Hello')).not.toContain('Re%3A+Re');
  });

  it('deep-links to the contacts page detail the page honours', () => {
    expect(senderContactHref('c42')).toBe('/contacts?contact=c42');
  });
});

describe('SenderHovercardCard', () => {
  it('shows a saved contact with company and Edit/Open actions, never Add', () => {
    const html = renderToStaticMarkup(
      <SenderHovercardCard
        name="Priya Sharma"
        email="priya@example.com"
        contact={contact({ company: 'Acme' })}
        contactState="loaded"
      />,
    );
    expect(html).toContain('In your contacts');
    expect(html).toContain('Acme');
    expect(html).toContain('Edit contact');
    expect(html).toContain('/contacts?contact=c1');
    expect(html).not.toContain('Add to Contacts');
  });

  it('shows "Not in your contacts" plus Add for an unmatched sender', () => {
    const html = renderToStaticMarkup(
      <SenderHovercardCard
        name="Stranger"
        email="stranger@example.com"
        contact={null}
        contactState="loaded"
      />,
    );
    expect(html).toContain('Not in your contacts');
    expect(html).toContain('Add to Contacts');
    expect(html).not.toContain('Edit contact');
  });

  it('wires Email to /compose and never invents chat/video availability', () => {
    const html = renderToStaticMarkup(
      <SenderHovercardCard
        name="Priya Sharma"
        email="priya@example.com"
        threadSubject="Hello"
        contact={null}
        contactState="loaded"
      />,
    );
    expect(html).toContain('/compose?to=priya%40example.com');
    // Chat and Video call are present but disabled + honestly labelled.
    expect(html).toContain('not wired yet');
    expect(html.match(/disabled/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('renders pure black with no divider borders', () => {
    const html = renderToStaticMarkup(
      <SenderHovercardCard name="Priya" email="priya@example.com" contact={null} contactState="idle" />,
    );
    expect(html).toContain('bg-black');
    expect(html).not.toContain('border-b');
    expect(html).not.toContain('divide-');
  });

  it('shows the lookup error honestly instead of faking a contact state', () => {
    const html = renderToStaticMarkup(
      <SenderHovercardCard name="Priya" email="priya@example.com" contact={null} contactState="error" />,
    );
    expect(html).toContain('Couldn');
    expect(html).not.toContain('In your contacts');
  });
});
