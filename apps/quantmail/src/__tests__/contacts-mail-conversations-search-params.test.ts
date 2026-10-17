import { describe, it, expect } from 'vitest';
import { contactThreadSearchParams } from '../app/(app)/contacts/components/ContactsSubViews';

/**
 * QM-SCREEN-012 R2 regression: the contact detail sheet's "Mail Conversations"
 * section used to send `query: "from:alice@x.com"` / `query: "to:alice@x.com"`.
 * The backend (EmailService.search) never parses `from:`/`to:` operators —
 * the literal string "from:alice@x.com" was `contains`-matched against
 * subject/body/fromAddress, which can never match a real address, so the
 * sheet always showed "No email threads found with this contact yet" even
 * when threads existed.
 *
 * The helper must therefore return STRUCTURED `from`/`to` params (ANDed
 * server-side) with the bare email as the free-text `q`, and never an
 * operator inside any value.
 */
describe('contactThreadSearchParams (QM-SCREEN-012 R2)', () => {
  it('returns structured from/to params with the bare email as q', () => {
    const [inbound, outbound] = contactThreadSearchParams('alice@contact.io');

    expect(inbound).toEqual({ query: 'alice@contact.io', from: 'alice@contact.io', pageSize: 20 });
    expect(outbound).toEqual({ query: 'alice@contact.io', to: 'alice@contact.io', pageSize: 20 });
  });

  it('never embeds a from:/to: operator in any sent value', () => {
    const [inbound, outbound] = contactThreadSearchParams('Alice@Contact.IO');

    for (const params of [inbound, outbound]) {
      for (const value of Object.values(params)) {
        expect(String(value)).not.toMatch(/(^|[^a-z])(from|to):/i);
      }
    }
  });

  it('lowercasing is left to the caller (helper passes the value through)', () => {
    const [inbound, outbound] = contactThreadSearchParams('alice@contact.io');
    expect(inbound.from).toBe('alice@contact.io');
    expect(outbound.to).toBe('alice@contact.io');
  });
});
