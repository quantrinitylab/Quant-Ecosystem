// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  INTERNAL_MAIL_DOMAINS,
  internalMailboxAliases,
  internalRecipientLookup,
  isInternalMailAddress,
  mailRecipientRoles,
  normalizeMailAddresses,
  visibleRecipientHeaders,
} from '../lib/mail-recipient-policy';

describe('mail recipient policy', () => {
  it('normalizes and deduplicates address columns', () => {
    expect(
      normalizeMailAddresses([' A@EXAMPLE.INVALID ', 'a@example.invalid', '', null, 7]),
    ).toEqual(['a@example.invalid']);
    expect(normalizeMailAddresses('a@example.invalid, b@example.invalid')).toEqual([
      'a@example.invalid',
      'b@example.invalid',
    ]);
    expect(normalizeMailAddresses(undefined)).toEqual([]);
  });

  it('recognizes each existing local mail domain', () => {
    for (const domain of INTERNAL_MAIL_DOMAINS) {
      expect(isInternalMailAddress(` Reader@${domain.toUpperCase()} `)).toBe(true);
    }
  });

  it('keeps other domains and invalid addresses outside the local namespace', () => {
    for (const address of [
      'reader@example.invalid',
      'reader@sub.quantmail.in',
      'reader',
      '@quantmail.in',
      'two words@quantmail.in',
    ]) {
      expect(isInternalMailAddress(address)).toBe(false);
    }
  });

  it('derives lookup aliases only from local recipient addresses', () => {
    const lookup = internalRecipientLookup(['Local@QuantMail.in', 'remote@example.invalid']);
    expect(lookup.local).toEqual(['local@quantmail.in']);
    expect(lookup.where.OR[1]).toEqual({ username: { in: ['local'], mode: 'insensitive' } });
    expect(JSON.stringify(lookup.where)).not.toContain('remote');
  });

  it('does not create a local lookup from an external-only envelope', () => {
    const lookup = internalRecipientLookup(['reader@example.invalid']);
    expect(lookup.local).toEqual([]);
    expect(lookup.where.OR[1]).toEqual({ username: { in: [], mode: 'insensitive' } });
  });

  it('builds local username aliases without claiming an external login address', () => {
    expect(internalMailboxAliases({ email: 'login@example.invalid', username: 'Reader' })).toEqual(
      INTERNAL_MAIL_DOMAINS.map((domain) => `reader@${domain}`),
    );
  });

  it('preserves supported aliases for a local mailbox without a username', () => {
    expect(internalMailboxAliases({ email: 'Reader@quantchat.online', username: null })).toEqual(
      INTERNAL_MAIL_DOMAINS.map((domain) => `reader@${domain}`),
    );
  });

  it('retains distinct To, Cc and Bcc roles with a unique envelope', () => {
    expect(
      mailRecipientRoles({
        toAddresses: ['a@example.invalid'],
        ccAddresses: ['A@example.invalid', 'c@example.invalid'],
        bccAddresses: ['b@example.invalid', 'C@example.invalid'],
      }),
    ).toEqual({
      to: ['a@example.invalid'],
      cc: ['c@example.invalid'],
      bcc: ['b@example.invalid'],
      envelope: ['a@example.invalid', 'c@example.invalid', 'b@example.invalid'],
    });
  });

  it('generates visible headers from To and Cc only', () => {
    expect(
      visibleRecipientHeaders({
        toAddresses: ['a@example.invalid'],
        ccAddresses: ['c@example.invalid'],
        bccAddresses: ['b@example.invalid'],
      }),
    ).toEqual({ to: 'a@example.invalid', cc: 'c@example.invalid' });
  });

  it('supports blind-only delivery without exposing a recipient in headers', () => {
    const message = { bccAddresses: ['b@example.invalid'] };
    expect(visibleRecipientHeaders(message)).toEqual({ to: 'undisclosed-recipients:;' });
    expect(mailRecipientRoles(message).envelope).toEqual(['b@example.invalid']);
  });
});
