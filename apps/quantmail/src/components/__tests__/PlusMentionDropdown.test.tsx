import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlusMentionDropdown } from '../PlusMentionDropdown';
import type { ContactSuggestion } from '../../types';

/**
 * The "+" mention picker list (shared by EmailComposer, DockedComposer,
 * ThreadComposer). Static-markup tests only — this repo's quantmail tests
 * must not import @testing-library/react (CI installs frozen lockfile and
 * the package is absent; see MEMORY.md 2026-10-13).
 */
const CONTACTS: ContactSuggestion[] = [
  { email: 'anita@acme-corp.com', name: 'Anita Rao' },
  { email: 'bob@example.com', name: 'Bob Verma' },
];

describe('PlusMentionDropdown', () => {
  it('renders names and addresses with the active row marked selected', () => {
    const html = renderToStaticMarkup(
      <PlusMentionDropdown
        suggestions={CONTACTS}
        activeIndex={1}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />,
    );
    expect(html).toContain('Anita Rao');
    expect(html).toContain('anita@acme-corp.com');
    expect(html).toContain('Bob Verma');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-selected="true"');
    // Pure-black surface, Mail orange accent for the active row, no
    // divider lines (rows separated by padding/gap only).
    expect(html).toContain('bg-black');
    expect(html).toContain('bg-[#F97316]/20');
    expect(html).not.toContain('divide-');
    expect(html).not.toContain('border-b');
    expect(html).not.toContain('border-t');
  });

  it('hangs below the textarea by default and above the bar when asked', () => {
    const below = renderToStaticMarkup(
      <PlusMentionDropdown suggestions={CONTACTS} activeIndex={-1} onSelect={vi.fn()} onHover={vi.fn()} />,
    );
    expect(below).toContain('top-full');
    const above = renderToStaticMarkup(
      <PlusMentionDropdown
        placement="above"
        suggestions={CONTACTS}
        activeIndex={-1}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />,
    );
    expect(above).toContain('bottom-full');
  });

  it('renders nothing when there are no suggestions', () => {
    const html = renderToStaticMarkup(
      <PlusMentionDropdown suggestions={[]} activeIndex={-1} onSelect={vi.fn()} onHover={vi.fn()} />,
    );
    expect(html).toBe('');
  });
});
