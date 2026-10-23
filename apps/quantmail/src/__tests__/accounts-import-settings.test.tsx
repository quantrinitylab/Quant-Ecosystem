/**
 * accounts-import-settings.test.tsx (fix/qm-accounts-import-send-as-2)
 *
 * The Settings → Account → "Accounts and Import" surface: send-mail-as
 * aliases, connected accounts, and mail/contacts import. QuantMail had no
 * "Accounts and Import" equivalent at all.
 *
 * DOM-free (no jsdom / @testing-library/react — neither is a dependency of
 * this package, so importing them fails CI's frozen-lockfile gate), via
 * renderToStaticMarkup. Effects never run in SSR, so these tests pin the
 * first-paint contract:
 *
 *  1. All three sections render with their titles and honest loading/error
 *     copy — the surface never pretends controls work before their data
 *     arrives.
 *  2. The send-as section's copy states the security rule in words: an
 *     address is only usable after its code is confirmed.
 *  3. The connected-accounts copy is explicit that QuantMail does not
 *     continuously fetch other providers' mail — no mailbox-fetcher is
 *     implied where none exists.
 *  4. The import copy says the password is used once and not stored.
 *  5. The composer's From row renders nothing when there are no verified
 *     aliases — a From picker with a single option is a control that
 *     changes nothing.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import {
  AccountsImportSettings,
  SendAsSection,
  ConnectedAccountsSection,
  ImportSection,
} from '../app/settings/account/AccountsImportSettings';
import { SendAsFromRow } from '../components/SendAsFromRow';

describe('AccountsImportSettings', () => {
  it('renders all three Accounts and Import sections', () => {
    const html = renderToStaticMarkup(<AccountsImportSettings />);
    expect(html).toContain('Send mail as');
    expect(html).toContain('Connected accounts');
    expect(html).toContain('Import mail &amp; contacts');
  });
});

describe('SendAsSection', () => {
  it('renders the title and loading state on first paint', () => {
    const html = renderToStaticMarkup(<SendAsSection />);
    expect(html).toContain('Send mail as');
    expect(html).toContain('Loading your send-as addresses');
  });

  it('states the activation rule in words', () => {
    const html = renderToStaticMarkup(<SendAsSection />);
    expect(html).toContain(
      'An address only becomes usable after you confirm the 6-digit code sent to it',
    );
  });
});

describe('ConnectedAccountsSection', () => {
  it('renders the title and loading state on first paint', () => {
    const html = renderToStaticMarkup(<ConnectedAccountsSection />);
    expect(html).toContain('Connected accounts');
    expect(html).toContain('Loading your connected accounts');
  });

  it('is explicit that no mailbox fetching happens', () => {
    const html = renderToStaticMarkup(<ConnectedAccountsSection />);
    expect(html).toContain('does not continuously pull mail from other providers');
  });
});

describe('ImportSection', () => {
  it('renders the import panels', () => {
    const html = renderToStaticMarkup(<ImportSection />);
    expect(html).toContain('Import mail &amp; contacts');
    expect(html).toContain('Import from another provider (IMAP)');
    expect(html).toContain('Import contacts');
  });

  it('is honest about the IMAP password handling', () => {
    const html = renderToStaticMarkup(<ImportSection />);
    expect(html).toContain('it is not stored');
  });
});

describe('SendAsFromRow', () => {
  it('renders nothing without verified aliases (SSR: identities never load)', () => {
    const html = renderToStaticMarkup(
      <SendAsFromRow
        value={null}
        onChange={() => {}}
        primaryEmail="kundan@quantmail.in"
        primaryName="Kundan"
      />,
    );
    expect(html).toBe('');
  });
});
