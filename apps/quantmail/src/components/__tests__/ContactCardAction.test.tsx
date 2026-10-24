import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// GroupInfoModal pulls useFocusTrap from @quant/shared-ui; the trap only
// activates inside the live Inspector, which these tests never render — but
// the module import still resolves it, so keep the real module (vitest
// resolves the workspace package) and only stub the api client the inspector
// calls for its contact lookup.
vi.mock('../../services/api-client', () => ({
  apiClient: {
    searchContacts: vi.fn().mockResolvedValue({ success: true, data: [] }),
    createContact: vi.fn().mockResolvedValue({ success: true, data: { id: 'c1' } }),
  },
}));

import { ContactCardAction, findContactByEmail } from '../GroupInfoModal';

/**
 * P2 competitor gap — "Add to Contacts" from the mail view.
 *
 * Gmail's mailbox contact card shows "Add to Contacts" for an unknown sender
 * and "Edit Contact" for a saved one. QuantMail's thread contact card had no
 * such action at all. The card action is presentational (lookup + create live
 * in ContactProfileInspector), so it renders under renderToStaticMarkup.
 */

describe('findContactByEmail', () => {
  it('matches the exact address case-insensitively', () => {
    expect(
      findContactByEmail(
        [{ email: 'Ada@Example.com' }, { email: 'grace@example.com' }],
        'ada@example.com',
      ),
    ).toBe(true);
  });

  it('does not match substring lookalikes from the backend search', () => {
    // searchContacts is a substring search: querying ada@x.com also returns
    // adana@x.com and name matches. Only email equality proves "saved".
    expect(findContactByEmail([{ email: 'adana@example.com' }], 'ada@example.com')).toBe(false);
    expect(findContactByEmail([{ email: 'other@example.com' }], 'ada@example.com')).toBe(false);
  });

  it('trims surrounding whitespace and tolerates missing data', () => {
    expect(findContactByEmail([{ email: '  ada@example.com ' }], ' ada@example.com ')).toBe(true);
    expect(findContactByEmail(undefined, 'ada@example.com')).toBe(false);
    expect(findContactByEmail([{ email: 'ada@example.com' }], '')).toBe(false);
  });
});

describe('ContactCardAction', () => {
  it('offers Add to Contacts for an unknown sender', () => {
    const html = renderToStaticMarkup(
      <ContactCardAction savedContactId={null} saving={false} error={null} onAdd={() => {}} />,
    );
    expect(html).toContain('Add to Contacts');
    expect(html).not.toContain('Edit Contact');
    expect(html).not.toContain('Saved to Contacts');
  });

  it('disables the button and says Adding… while a create is in flight', () => {
    const html = renderToStaticMarkup(
      <ContactCardAction savedContactId={null} saving error={null} onAdd={() => {}} />,
    );
    expect(html).toContain('Adding…');
    expect(html).toContain('disabled');
  });

  it('shows Saved + Edit Contact deep link for an already-saved sender', () => {
    const html = renderToStaticMarkup(
      <ContactCardAction savedContactId="c-42" saving={false} error={null} onAdd={() => {}} />,
    );
    expect(html).toContain('Saved to Contacts');
    expect(html).toContain('Edit Contact');
    expect(html).toContain('/contacts?contact=c-42');
    expect(html).not.toContain('Add to Contacts');
  });

  it('renders a failed create honestly instead of pretending success', () => {
    const html = renderToStaticMarkup(
      <ContactCardAction
        savedContactId={null}
        saving={false}
        error="Could not add this contact. Please try again."
        onAdd={() => {}}
      />,
    );
    expect(html).toContain('Could not add this contact');
    expect(html).toContain('role="alert"');
  });
});
