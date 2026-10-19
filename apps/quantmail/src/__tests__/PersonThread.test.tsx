// @vitest-environment jsdom
// ============================================================================
// People view PART 2 — PersonThread contract pins.
//
// The unified "email with chat" thread must: render both directions in
// chronological order, right-align sent / left-align received, show the
// user-locked "Naya vishay: <subject>" separator only on subject changes,
// expand/collapse long bodies, and keep the composer slot out of the Updates
// world.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// framer-motion (used by AttachmentPreview) reads matchMedia, which jsdom
// does not implement. The shim is a test-environment concern, not product
// behaviour: reduced-motion is off so previews render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonThread, messageSortTime, compareMessagesChronologically, type PersonConversation } from '../components/PersonThread';
import type { Email } from '../types';

const ME = 'me@quantmail.in';
const FRIEND = 'friend@example.com';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: FRIEND, name: 'Friend' },
    to: [{ email: ME }],
    cc: [],
    bcc: [],
    subject: 'Hello',
    bodyText: '',
    bodyHtml: '',
    snippet: '',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    receivedAt: new Date('2026-10-10T08:00:00Z'),
    ...partial,
  };
}

function makeConversation(overrides: Partial<PersonConversation> = {}): PersonConversation {
  const messages: Email[] = [
    makeEmail({ id: 'm1', bodyText: 'Hey, how are you?', receivedAt: new Date('2026-10-10T08:00:00Z') }),
    makeEmail({
      id: 'm2',
      from: { email: ME, name: 'Me' },
      to: [{ email: FRIEND, name: 'Friend' }],
      bodyText: 'Doing well!',
      receivedAt: new Date('2026-10-10T08:05:00Z'),
    }),
  ];
  return {
    personKey: 'friend@example.com',
    name: 'Friend',
    email: FRIEND,
    messages,
    lastMessage: messages[1],
    lastActivityAt: new Date('2026-10-10T08:05:00Z'),
    unreadCount: 0,
    lastMessageFromMe: true,
    world: 'log',
    participantEmails: [ME, FRIEND],
    hasGroupMessages: false,
    ...overrides,
  };
}

let root: Root | null = null;
function renderIntoDom(node: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

describe('PersonThread', () => {
  it('renders both directions in chronological order', () => {
    const conversation = makeConversation();
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const first = html.indexOf('Hey, how are you?');
    const second = html.indexOf('Doing well!');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
  });

  it('marks sent messages right-aligned and received left-aligned via data hooks', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const rows = Array.from(container.querySelectorAll('[data-testid="thread-message"]'));
    expect(rows).toHaveLength(2);
    // m1 received
    expect(rows[0].getAttribute('data-sent')).toBe('false');
    expect(rows[0].querySelector('.justify-start')).not.toBeNull();
    // m2 sent
    expect(rows[1].getAttribute('data-sent')).toBe('true');
    expect(rows[1].querySelector('.justify-end')).not.toBeNull();
  });

  it('shows the user-locked "Naya vishay:" separator only when the subject changes', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({ id: 'm1', subject: 'Old topic', bodyText: 'first', receivedAt: new Date('2026-10-10T08:00:00Z') }),
        makeEmail({
          id: 'm2',
          subject: 'New topic',
          from: { email: ME, name: 'Me' },
          to: [{ email: FRIEND }],
          bodyText: 'second',
          receivedAt: new Date('2026-10-10T08:05:00Z'),
        }),
        makeEmail({
          id: 'm3',
          subject: 'New topic',
          bodyText: 'third',
          receivedAt: new Date('2026-10-10T08:10:00Z'),
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const separators = Array.from(container.querySelectorAll('[data-testid="subject-change"]'));
    expect(separators).toHaveLength(1);
    expect(separators[0].textContent).toContain('Naya vishay: New topic');
  });

  it('shows no separator when the subject never changes', () => {
    const conversation = makeConversation();
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).not.toContain('Naya vishay:');
  });

  it('expands and collapses a long body with Show more / Show less', () => {
    const longBody = `start ${'x'.repeat(300)} tail-marker`;
    const conversation = makeConversation({
      messages: [makeEmail({ id: 'm1', bodyText: longBody })],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const row = container.querySelector('[data-testid="thread-message"]')!;
    // Collapsed: snippet only, ends with ellipsis, "Show more" visible.
    expect(row.textContent).not.toContain('tail-marker');
    expect(row.textContent).toContain('…');
    const toggle = row.querySelector('button')!;
    expect(toggle.textContent).toBe('Show more');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row.textContent).toContain('tail-marker');
    expect(toggle.textContent).toBe('Show less');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row.textContent).not.toContain('tail-marker');
    expect(toggle.textContent).toBe('Show more');
  });

  it('does not offer a Show more toggle for short bodies', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('strips HTML when only bodyHtml is present instead of injecting it', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({
          id: 'm1',
          bodyHtml: '<p>Hello <b>there</b></p><script>alert("x")</script>',
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).toContain('Hello there');
    expect(html).not.toContain('<script>');
  });

  it('renders real attachment filenames and sizes, nothing invented', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({
          id: 'm1',
          bodyText: 'see attached',
          attachments: [
            {
              id: 'a1',
              createdAt: new Date(),
              updatedAt: new Date(),
              emailId: 'm1',
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              size: 1536,
              url: 'https://example.com/invoice.pdf',
              isInline: false,
            },
          ],
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).toContain('invoice.pdf');
    expect(html).toContain('1.5 KB');
  });

  it('updates world: hides the composer slot and shows the no-reply note', () => {
    const conversation = makeConversation({ world: 'updates' });
    const container = renderIntoDom(
      <PersonThread
        conversation={conversation}
        currentUserEmail={ME}
        renderComposer={<div data-testid="composer-slot">composer</div>}
      />,
    );
    expect(container.querySelector('[data-testid="composer-slot"]')).toBeNull();
    const note = container.querySelector('[data-testid="updates-no-reply-note"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Notifications don't need a reply");
  });

  it('log world: renders the composer slot when provided', () => {
    const conversation = makeConversation({ world: 'log' });
    const container = renderIntoDom(
      <PersonThread
        conversation={conversation}
        currentUserEmail={ME}
        renderComposer={<div data-testid="composer-slot">composer</div>}
      />,
    );
    expect(container.querySelector('[data-testid="composer-slot"]')).not.toBeNull();
  });

  it('groups world: shows stacked participant avatars and the real participant count', () => {
    const conversation = makeConversation({
      world: 'groups',
      name: 'Weekend plan',
      participantEmails: [ME, FRIEND, 'third@example.com'],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const count = container.querySelector('[data-testid="thread-participant-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toContain('3 people');
  });

  it('P1-F: renders only the last 50 messages with a Load earlier button', () => {
    const messages: Email[] = Array.from({ length: 75 }, (_, i) =>
      makeEmail({
        id: `bulk-${i}`,
        bodyText: `Message number ${i}`,
        receivedAt: new Date(`2026-10-10T${String(8 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
      }),
    );
    const conversation = makeConversation({ messages, lastMessage: messages[74] });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const rows = container.querySelectorAll('[data-testid="thread-message"]');
    expect(rows).toHaveLength(50);
    const loadMore = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load earlier messages'),
    );
    expect(loadMore).not.toBeUndefined();
    expect(loadMore!.textContent).toContain('25 more');
    // Tapping reveals the rest.
    act(() => {
      loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelectorAll('[data-testid="thread-message"]')).toHaveLength(75);
  });

  it('P1-F: shows no Load earlier button when the thread fits in the window', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const loadMore = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load earlier messages'),
    );
    expect(loadMore).toBeUndefined();
  });

  it('P1-A: shows the New messages pill instead of yanking when scrolled up', () => {
    const m1 = makeEmail({ id: 'p1a-1', bodyText: 'first', receivedAt: new Date('2026-10-10T08:00:00Z') });
    const conversation = makeConversation({ messages: [m1], lastMessage: m1 });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const scroller = container.querySelector('[data-testid="thread-scroll"]') as HTMLElement;
    // Simulate the user scrolled up: large scrollable area, parked at top.
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    scroller.scrollTop = 0;
    // A new message arrives via background poll.
    const m2 = makeEmail({ id: 'p1a-2', bodyText: 'second', receivedAt: new Date('2026-10-10T08:01:00Z') });
    const updated = { ...conversation, messages: [m1, m2], lastMessage: m2 };
    act(() => {
      root!.render(<PersonThread conversation={updated} currentUserEmail={ME} />);
    });
    const pill = container.querySelector('[data-testid="new-messages-pill"]');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toContain('New messages');
    // Tapping the pill jumps to the bottom and dismisses it.
    act(() => {
      pill!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="new-messages-pill"]')).toBeNull();
  });

  it('P1-C: renders a pending send as a Sending bubble, not a timestamp', () => {
    const pending = makeEmail({
      id: 'pending-abc123',
      from: { email: ME, name: 'Me' },
      to: [{ email: FRIEND }],
      bodyText: 'optimistic hello',
      isSent: true,
      receivedAt: new Date('2026-10-10T08:10:00Z'),
      pendingSend: true,
    } as Partial<Email> & { pendingSend?: boolean });
    const conversation = makeConversation({ messages: [pending], lastMessage: pending });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const row = container.querySelector('[data-testid="thread-message"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('optimistic hello');
    expect(row!.textContent).toContain('Sending');
    // Right-aligned like any sent message.
    expect(row!.getAttribute('data-sent')).toBe('true');
  });

  it('never renders "Invalid Date" for an unparseable receivedAt', () => {
    const broken = makeEmail({
      id: 'broken-ts',
      bodyText: 'message with a broken timestamp',
      receivedAt: new Date(NaN),
    } as Partial<Email>);
    const conversation = makeConversation({ messages: [broken], lastMessage: broken });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const row = container.querySelector('[data-testid="thread-message"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('message with a broken timestamp');
    // The invalid timestamp degrades to an empty honest fallback.
    expect(row!.textContent).not.toContain('Invalid Date');
    const timeSlot = row!.querySelector('.text-right');
    expect(timeSlot).not.toBeNull();
    expect(timeSlot!.textContent!.trim()).toBe('');
  });
});

// ============================================================================
// PersonThread attachments — interactive preview chips (fix/qm-personthread-attachments).
//
// The PersonThread attachment block used to render plain non-interactive
// divs (filename + size, no preview/download path). It now reuses the
// AttachmentPreview component (thumbnails, lightbox, honest Save-to-Drive).
// These pins prove: chips are real buttons, clicking one with a url opens
// the preview lightbox, a url-less attachment opens nothing fake, and the
// Save-to-Drive button appears only when the backend can actually read the
// bytes (AttachmentService "att_<uuid>" rows — QM-M39-010).
// ============================================================================

function makeAttachmentEmail(over: {
  id: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url?: string;
  }>;
}) {
  return makeEmail({
    id: over.id,
    bodyText: 'see attached',
    attachments: over.attachments.map((a) => ({
      id: a.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailId: over.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: a.url ?? '',
      isInline: false,
    })),
  });
}

describe('PersonThread attachments (interactive chips)', () => {
  it('keeps the thread-attachments testid and renders each attachment as a real button', () => {
    const conversation = makeConversation({
      messages: [
        makeAttachmentEmail({
          id: 'm1',
          attachments: [
            { id: 'a1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 1536, url: 'https://example.com/invoice.pdf' },
          ],
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const block = container.querySelector('[data-testid="thread-attachments"]');
    expect(block).not.toBeNull();
    // The chip is a <button>, not a bare div: keyboard-focusable, clickable.
    const chip = block!.querySelector('button');
    expect(chip).not.toBeNull();
    expect(chip!.tagName).toBe('BUTTON');
    expect(chip!.getAttribute('title')).toBe('invoice.pdf');
    expect(chip!.textContent).toContain('invoice.pdf');
    expect(chip!.textContent).toContain('1.5 KB');
  });

  it('opens the preview lightbox when a chip with a real url is clicked', () => {
    const conversation = makeConversation({
      messages: [
        makeAttachmentEmail({
          id: 'm1',
          attachments: [
            { id: 'a1', filename: 'photo.png', mimeType: 'image/png', size: 2048, url: 'https://example.com/photo.png' },
          ],
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const chip = container.querySelector(
      '[data-testid="thread-attachments"] button',
    ) as HTMLButtonElement;
    expect(chip).not.toBeNull();
    act(() => {
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const lightbox = container.querySelector('.attachment-lightbox');
    expect(lightbox).not.toBeNull();
    const img = lightbox!.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/photo.png');
  });

  it('opens no fake preview for an attachment with no url', () => {
    const conversation = makeConversation({
      messages: [
        makeAttachmentEmail({
          id: 'm1',
          attachments: [
            { id: 'a1', filename: 'orphan.pdf', mimeType: 'application/pdf', size: 100 },
          ],
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const chip = container.querySelector(
      '[data-testid="thread-attachments"] button',
    ) as HTMLButtonElement;
    expect(chip).not.toBeNull();
    act(() => {
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // No url on the wire → no lightbox. A button that opened an empty
    // preview would be a fake control.
    expect(container.querySelector('.attachment-lightbox')).toBeNull();
  });

  it('offers Save to Drive only when the backend can read the bytes (att_ rows)', () => {
    const conversation = makeConversation({
      messages: [
        makeAttachmentEmail({
          id: 'm1',
          attachments: [
            // AttachmentService row: bytes readable → Save button is honest.
            { id: 'att_9f3c2a1b-4d5e-4f60-8a7b-1c2d3e4f5a6b', filename: 'saved.pdf', mimeType: 'application/pdf', size: 100, url: 'https://example.com/saved.pdf' },
          ],
        }),
        makeAttachmentEmail({
          id: 'm3',
          attachments: [
            // Composer id: shares the att_ prefix, names no stored object → no Save button.
            { id: 'att_1760000000000_k3j4h5', filename: 'sent.pdf', mimeType: 'application/pdf', size: 100, url: 'data:application/pdf;base64,JVBERi0=' },
          ],
        }),
        makeAttachmentEmail({
          id: 'm2',
          attachments: [
            // Inbound metadata-only row: no readable bytes → no Save button.
            { id: 'a2', filename: 'meta.pdf', mimeType: 'application/pdf', size: 100, url: 'https://example.com/meta.pdf' },
          ],
        }),
        makeAttachmentEmail({
          id: 'm4',
          attachments: [
            // Legacy string attachment as the backend formatter ships it:
            // a synthesized meta_ id (never att_) → no Save button, even
            // though the row carries a url.
            { id: 'meta_0', filename: 'legacy.pdf', mimeType: 'application/pdf', size: 100, url: 'https://example.com/legacy.pdf' },
          ],
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const saveButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent === 'Save to Drive',
    );
    expect(saveButtons).toHaveLength(1);
  });

  it('renders nothing for the attachments block when there are no attachments', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(container.querySelector('[data-testid="thread-attachments"]')).toBeNull();
  });
});

// ============================================================================
// PersonThread invalid-date sort guard (fix/qm-personthread-sort-nan).
//
// The old comparator `new Date(a.receivedAt).getTime() -
// new Date(b.receivedAt).getTime()` returned NaN for an unparseable
// receivedAt, violating the sort contract: the message landed at an
// arbitrary position and the 50-message tail windowing could clip real
// messages around it. Invalid timestamps now pin to -Infinity (start of
// the thread, behind "Load earlier messages"), and the comparator uses
// three-way comparison so antisymmetry/transitivity hold for every pair.
// ============================================================================

function sortEmail(over: Partial<Email> & { id: string }): Email {
  return makeEmail({ receivedAt: new Date('2026-10-10T08:00:00Z'), ...over });
}

describe('PersonThread invalid-date sort guard', () => {
  it('messageSortTime pins an unparseable receivedAt below every valid timestamp', () => {
    expect(messageSortTime(new Date(NaN))).toBe(Number.NEGATIVE_INFINITY);
    expect(messageSortTime('not-a-date')).toBe(Number.NEGATIVE_INFINITY);
    expect(messageSortTime(new Date('2026-10-10T08:00:00Z'))).toBe(
      new Date('2026-10-10T08:00:00Z').getTime(),
    );
  });

  it('compareMessagesChronologically never returns NaN and is antisymmetric', () => {
    const invalid = sortEmail({ id: 'inv', receivedAt: new Date(NaN) });
    const valid = sortEmail({ id: 'vld', receivedAt: new Date('2026-10-10T09:00:00Z') });
    const invalidB = sortEmail({ id: 'inv-b', receivedAt: 'garbage' as unknown as Date });
    const pairs: Array<[Email, Email]> = [
      [invalid, valid],
      [valid, invalid],
      [invalid, invalidB],
      [invalidB, invalid],
      [invalid, { ...invalid }],
      [valid, { ...valid }],
    ];
    for (const [a, b] of pairs) {
      const ab = compareMessagesChronologically(a, b);
      const ba = compareMessagesChronologically(b, a);
      expect(Number.isNaN(ab)).toBe(false);
      expect(Number.isNaN(ba)).toBe(false);
      // Antisymmetry: cmp(a,b) and cmp(b,a) must have opposite signs (or both zero).
      // (Both zero is the equal case: Math.sign(0) === 0 and -0, Object.is-distinct.)
      expect(Math.sign(ab) === 0 ? Math.sign(ba) === 0 : Math.sign(ab) === -Math.sign(ba)).toBe(true);
    }
    // Invalid sorts strictly before valid in both argument orders.
    expect(compareMessagesChronologically(invalid, valid)).toBe(-1);
    expect(compareMessagesChronologically(valid, invalid)).toBe(1);
  });

  it('compareMessagesChronologically is transitive on a mixed triple', () => {
    const a = sortEmail({ id: 'a', receivedAt: new Date(NaN) });
    const b = sortEmail({ id: 'b', receivedAt: new Date('2026-10-10T08:00:00Z') });
    const c = sortEmail({ id: 'c', receivedAt: new Date('2026-10-10T09:00:00Z') });
    expect(compareMessagesChronologically(a, b)).toBeLessThan(0);
    expect(compareMessagesChronologically(b, c)).toBeLessThan(0);
    expect(compareMessagesChronologically(a, c)).toBeLessThan(0);
    // Sorted order is fully deterministic: invalid first, then ascending, id tie-break.
    const shuffled = [c, a, b].sort(compareMessagesChronologically);
    expect(shuffled.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // Two invalid-date messages order deterministically by id, not arbitrarily.
    const i1 = sortEmail({ id: 'zz', receivedAt: new Date(NaN) });
    const i2 = sortEmail({ id: 'aa', receivedAt: 'nope' as unknown as Date });
    expect([i1, i2].sort(compareMessagesChronologically).map((m) => m.id)).toEqual(['aa', 'zz']);
  });

  it('an invalid-date message sorts to the start of the thread, ahead of all valid messages', () => {
    const broken = sortEmail({
      id: 'broken-ts',
      bodyText: 'message with a broken timestamp',
      receivedAt: new Date(NaN),
    });
    const earlier = sortEmail({ id: 'early', bodyText: 'early', receivedAt: new Date('2026-10-10T08:00:00Z') });
    const later = sortEmail({ id: 'late', bodyText: 'late', receivedAt: new Date('2026-10-10T09:00:00Z') });
    // Delivered in an order designed to trap NaN placement: invalid in the middle.
    const conversation = makeConversation({ messages: [earlier, broken, later], lastMessage: later });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const rows = container.querySelectorAll('[data-testid="thread-message"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('message with a broken timestamp');
    expect(rows[1].textContent).toContain('early');
    expect(rows[2].textContent).toContain('late');
  });

  it('an invalid-date message stays out of the visible 50-message tail window', () => {
    // 51 valid messages + 1 invalid: the invalid one must not sit in the
    // visible window and must not push a real message out of it.
    const valids: Email[] = Array.from({ length: 51 }, (_, i) =>
      sortEmail({
        id: `bulk-${i}`,
        bodyText: `Valid message ${i}`,
        receivedAt: new Date(`2026-10-10T${String(8 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`),
      }),
    );
    const broken = sortEmail({
      id: 'broken-ts',
      bodyText: 'message with a broken timestamp',
      receivedAt: new Date(NaN),
    });
    // Insert the broken message in the middle of the input order to prove
    // sort placement is deterministic regardless of input order.
    const messages = [...valids.slice(0, 25), broken, ...valids.slice(25)];
    const conversation = makeConversation({ messages, lastMessage: valids[50] });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const rows = container.querySelectorAll('[data-testid="thread-message"]');
    expect(rows).toHaveLength(50);
    // The invalid message is not in the visible window…
    expect(
      Array.from(rows).some((r) => r.textContent?.includes('message with a broken timestamp')),
    ).toBe(false);
    // …and the newest real message is not clipped out of it.
    expect(rows[49].textContent).toContain('Valid message 50');
    const loadMore = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load earlier messages'),
    );
    expect(loadMore).not.toBeUndefined();
    expect(loadMore!.textContent).toContain('2 more');
    // Loading earlier messages reveals the invalid-date message at the very start.
    act(() => {
      loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const allRows = container.querySelectorAll('[data-testid="thread-message"]');
    expect(allRows).toHaveLength(52);
    expect(allRows[0].textContent).toContain('message with a broken timestamp');
  });
});
