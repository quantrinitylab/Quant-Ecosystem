// Vitest environment is node (repo convention for quantmail tests — CI has no
// jsdom and this test only needs renderToStaticMarkup).
// ============================================================================
// ContactHoverCard — Gmail/Superhuman-style hover contact card + one-tap
// "Add to contacts" from the mail reader.
// ============================================================================
//
// Contract pinned here:
//
//   • The trigger renders its children unchanged; with no email there is no
//     identifiable person, so the children render bare with no card wrapper.
//   • The card body names the person honestly: the known display name when
//     mail carried one, the bare address when it did not — never an invented
//     name (displayNameForCard).
//   • A stranger gets an "Add to contacts" action (aria-labelled with the
//     name); a known contact gets an "In contacts" badge instead.
//   • While the address-book answer is in flight the card says
//     "Checking contacts…" instead of guessing; when the fetch fails it says
//     "Couldn't check contacts" instead of hiding the row.
//   • An in-flight add shows "Adding…" and disables the button (no
//     double-add races).
//   • The card renders in a fixed-position portal (never clipped by the
//     reader's overflow-hidden/truncate ancestors); it is not in the tree
//     until the trigger is hovered/tapped.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ContactHoverCard,
  ContactCardBody,
  displayNameForCard,
  type ContactCardBodyProps,
} from '../ContactHoverCard';

function withClient(children: React.ReactNode): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const noop = () => {};
const cardRef = { current: null };

function bodyProps(overrides: Partial<ContactCardBodyProps> = {}): ContactCardBodyProps {
  return {
    email: 'alice@example.com',
    name: 'Alice',
    isKnown: false,
    directoryError: false,
    isAdding: false,
    onAdd: noop,
    onCardEnter: noop,
    onCardLeave: noop,
    onCardFocus: noop,
    onCardBlur: noop,
    cardRef,
    ...overrides,
  };
}

describe('displayNameForCard', () => {
  it('uses the known name when mail carried one', () => {
    expect(displayNameForCard('alice@example.com', 'Alice')).toBe('Alice');
  });

  it('trims the name but never invents one', () => {
    expect(displayNameForCard('alice@example.com', '  Alice  ')).toBe('Alice');
    expect(displayNameForCard('alice@example.com', '')).toBe('alice@example.com');
    expect(displayNameForCard('alice@example.com', '   ')).toBe('alice@example.com');
    expect(displayNameForCard('alice@example.com', undefined)).toBe('alice@example.com');
    expect(displayNameForCard('alice@example.com', null)).toBe('alice@example.com');
  });
});

describe('ContactCardBody', () => {
  it('shows an Add to contacts action for a stranger, with name and email', () => {
    const html = renderToStaticMarkup(<ContactCardBody {...bodyProps()} />);
    expect(html).toContain('Add to contacts');
    expect(html).toContain('aria-label="Add Alice to contacts"');
    expect(html).toContain('alice@example.com');
    expect(html).not.toContain('In contacts');
  });

  it('shows the In contacts badge and no add action for a known contact', () => {
    const html = renderToStaticMarkup(<ContactCardBody {...bodyProps({ isKnown: true })} />);
    expect(html).toContain('In contacts');
    expect(html).not.toContain('Add to contacts');
  });

  it('says it is checking instead of guessing while the directory loads', () => {
    const html = renderToStaticMarkup(<ContactCardBody {...bodyProps({ isKnown: null })} />);
    expect(html).toContain('Checking contacts…');
    expect(html).not.toContain('Add to contacts');
    expect(html).not.toContain('In contacts');
  });

  it('says so honestly when the directory fetch failed', () => {
    const html = renderToStaticMarkup(
      <ContactCardBody {...bodyProps({ isKnown: null, directoryError: true })} />,
    );
    expect(html).toContain('Couldn&#x27;t check contacts');
  });

  it('disables the add button and shows Adding… while the mutation is in flight', () => {
    const html = renderToStaticMarkup(<ContactCardBody {...bodyProps({ isAdding: true })} />);
    expect(html).toContain('Adding…');
    expect(html).toContain('disabled');
  });

  it('renders the address itself when no name is known — never an invented name', () => {
    const html = renderToStaticMarkup(
      <ContactCardBody {...bodyProps({ email: 'noname@example.com', name: undefined })} />,
    );
    expect(html).toContain('noname@example.com');
    expect(html).toContain('aria-label="Add noname@example.com to contacts"');
  });

  it('exposes the card as a dialog with an accessible name', () => {
    const html = renderToStaticMarkup(<ContactCardBody {...bodyProps({ isKnown: true })} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Contact card for Alice"');
  });
});

describe('ContactHoverCard', () => {
  it('renders children bare with no card when there is no email', () => {
    const html = renderToStaticMarkup(
      withClient(
        <ContactHoverCard email="">
          <span>Some Sender</span>
        </ContactHoverCard>,
      ),
    );
    expect(html).toContain('Some Sender');
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('aria-haspopup');
  });

  it('renders the trigger as a labelled button that owns a dialog, closed by default', () => {
    const html = renderToStaticMarkup(
      withClient(
        <ContactHoverCard email="alice@example.com" name="Alice">
          <span>Some Sender</span>
        </ContactHoverCard>,
      ),
    );
    expect(html).toContain('Some Sender');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Contact card for Alice"');
    expect(html).toContain('aria-expanded="false"');
    // The card itself is not in the tree until the trigger is hovered/tapped.
    expect(html).not.toContain('role="dialog"');
  });
});
