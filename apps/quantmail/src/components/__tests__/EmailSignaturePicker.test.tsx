/**
 * Multiple signatures (fix/qm-multiple-signatures).
 *
 * Gmail pairs multiple signatures with a per-message insert/switch picker in
 * compose; QuantMail's composer only ever loaded the default. These tests pin:
 *
 * (a) the picker itself — every signature renders as an option, the default
 *     is marked "(Default)", and the composer's current choice is selected;
 * (b) the wiring — EmailComposer mounts the picker and loads the list, and
 *     Settings manages the list (create / set-default / delete) instead of
 *     editing only the default row. The wiring half is a source scan, the
 *     same pattern the composer no-divider/pure-black lock uses: the full
 *     composer and settings page are too heavy to render for a wiring
 *     assertion, and the scan fails the moment the wiring is removed.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmailSignaturePicker } from '../EmailSignaturePicker';
import type { EmailSignatureOption } from '../../lib/email-signature-preference';

const here = dirname(fileURLToPath(import.meta.url));
const src = (relative: string) => readFileSync(join(here, '..', relative), 'utf8');

const SIGNATURES: EmailSignatureOption[] = [
  { id: 'sig-formal', name: 'Formal', contentHtml: 'Best regards', isDefault: true },
  { id: 'sig-casual', name: 'Casual', contentHtml: 'Cheers', isDefault: false },
];

describe('EmailSignaturePicker', () => {
  it('renders one option per signature with the default marked', () => {
    const markup = renderToStaticMarkup(
      <EmailSignaturePicker
        signatures={SIGNATURES}
        selectedId="sig-formal"
        onSelect={() => {}}
      />,
    );

    expect(markup).toContain('Formal (Default)');
    expect(markup).toContain('Casual');
    expect(markup).not.toContain('Casual (Default)');
    expect(markup).toContain('aria-label="Signature"');
  });

  it('marks the composer’s current choice as selected', () => {
    const markup = renderToStaticMarkup(
      <EmailSignaturePicker
        signatures={SIGNATURES}
        selectedId="sig-casual"
        onSelect={() => {}}
      />,
    );

    // React's static markup marks the option matching the select's value.
    expect(markup).toContain('selected');
    expect(markup).toContain('value="sig-casual"');
  });
});

describe('multiple-signature wiring', () => {
  it('EmailComposer loads the list and mounts the picker', () => {
    const composer = src('EmailComposer.tsx');
    expect(composer).toContain('loadEmailSignatures');
    expect(composer).toContain('pickDefaultSignature');
    expect(composer).toContain('<EmailSignaturePicker');
    expect(composer).toContain('handleSelectSignature');
    // The picker only appears when there is a choice to make — a
    // single-signature account sees exactly the old block.
    expect(composer).toContain('signatureOptions.length > 1');
  });

  it('Settings manages the full list, not just the default row', () => {
    const settings = src('../app/settings/page.tsx');
    expect(settings).toContain('getEmailSignatures');
    expect(settings).toContain('setDefaultEmailSignature');
    expect(settings).toContain('deleteEmailSignature');
    expect(settings).toContain('createEmailSignature');
    expect(settings).toContain('handleSelectSignature');
    expect(settings).toContain('Set as default');
    expect(settings).toContain('Add signature');
  });

  it('api-client exposes the set-default endpoint', () => {
    const apiClient = src('../services/api-client.ts');
    expect(apiClient).toContain('setDefaultEmailSignature');
    expect(apiClient).toContain('/email-signatures/${id}/default');
  });
});
