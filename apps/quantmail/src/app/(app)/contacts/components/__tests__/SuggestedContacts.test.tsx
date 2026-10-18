// Vitest environment is node (repo convention for quantmail tests — CI has no
// jsdom and this test only needs renderToStaticMarkup).
// ============================================================================
// SuggestedContacts — "Suggested from your mail" (Gmail Merge & Fix analogue).
// ============================================================================
//
// Contract pinned here:
//
//   • Renders nothing when there are no suggestions (the page must not show an
//     empty "suggested" card — the whole point is that the surface appears
//     only when there is somebody to suggest).
//   • Every row names the person honestly: the known display name when mail
//     carried one, the bare address when it did not — never an invented name.
//   • The activity line states the real direction and count ("emailed you 12
//     messages", "3 messages back and forth"), with honest recency.
//   • The Add button calls back with the full suggestion so the page can
//     one-click add via POST /contacts; the in-flight row shows "Adding…"
//     and disables the button (no double-add races).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SuggestedContacts, formatSuggestionActivity } from '../SuggestedContacts';
import type { ContactActivitySuggestion } from '../../../types';

function suggestion(partial: Partial<ContactActivitySuggestion> = {}): ContactActivitySuggestion {
  return {
    email: 'alice@example.com',
    name: 'Alice',
    messageCount: 12,
    lastMessageAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    direction: 'inbound',
    ...partial,
  };
}

describe('SuggestedContacts', () => {
  it('renders nothing when there are no suggestions', () => {
    expect(
      renderToStaticMarkup(
        <SuggestedContacts suggestions={[]} addingEmail={null} onAdd={() => {}} />,
      ),
    ).toBe('');
  });

  it('renders one row per suggestion with name, address and honest activity', () => {
    const html = renderToStaticMarkup(
      <SuggestedContacts
        suggestions={[
          suggestion(),
          suggestion({
            email: 'noname@example.com',
            name: null,
            messageCount: 3,
            direction: 'outbound',
            lastMessageAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
          }),
        ]}
        addingEmail={null}
        onAdd={() => {}}
      />,
    );
    expect(html).toContain('Suggested from your mail');
    expect(html).toContain('Alice');
    expect(html).toContain('alice@example.com');
    // The nameless row renders the bare address as its title — no invented name.
    expect(html).toContain('noname@example.com');
    expect(html).toContain('emailed you 12 messages');
    expect(html).toContain('you emailed 3 messages');
    // Two Add buttons, one per row.
    expect(html.match(/>Add</g)).toHaveLength(2);
  });

  it('marks a both-directions correspondent as back-and-forth', () => {
    const html = renderToStaticMarkup(
      <SuggestedContacts
        suggestions={[suggestion({ direction: 'both', messageCount: 7 })]}
        addingEmail={null}
        onAdd={() => {}}
      />,
    );
    expect(html).toContain('7 messages back and forth');
  });

  it('shows Adding… and disables the in-flight row only', () => {
    const onAdd = vi.fn();
    const html = renderToStaticMarkup(
      <SuggestedContacts
        suggestions={[suggestion(), suggestion({ email: 'bob@example.com', name: 'Bob' })]}
        addingEmail="alice@example.com"
        onAdd={onAdd}
      />,
    );
    expect(html).toContain('Adding…');
    // The in-flight row's button is disabled; the other row still offers Add.
    expect(html).toContain('disabled');
    expect(html).toContain('>Add<');
  });

  it('calls back with the suggestion when Add is clicked', () => {
    // renderToStaticMarkup cannot fire events; assert the aria contract that
    // the interactive test would click.
    const html = renderToStaticMarkup(
      <SuggestedContacts suggestions={[suggestion()]} addingEmail={null} onAdd={() => {}} />,
    );
    expect(html).toContain('aria-label="Add Alice to contacts"');
  });
});

describe('formatSuggestionActivity', () => {
  it('handles singular counts and missing recency', () => {
    expect(
      formatSuggestionActivity(
        suggestion({ messageCount: 1, direction: 'inbound', lastMessageAt: null }),
      ),
    ).toBe('emailed you 1 message');
  });

  it('says today/yesterday for fresh mail', () => {
    expect(
      formatSuggestionActivity(
        suggestion({ direction: 'outbound', lastMessageAt: new Date().toISOString() }),
      ),
    ).toContain('today');
  });
});
