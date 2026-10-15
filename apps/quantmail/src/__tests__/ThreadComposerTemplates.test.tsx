// @vitest-environment jsdom
// ThreadComposer saved-templates wiring (qm fix: thread-composer-templates).
//
// The People-thread reply surface gets the same backend-backed
// /email-templates picker the docked composer already wires: a Templates
// button in the chat bar opens the portaled EmailTemplates popover, and
// selecting a template inserts its body into the reply draft
// non-destructively. The merge rules live in the pure
// `mergeSavedTemplateIntoDraft` / `applyThreadTemplateToDraft` helpers,
// asserted directly; component-level assertions use renderToStaticMarkup,
// the repo's established pattern for component tests (no
// @testing-library/react in this app). The real EmailTemplates is module-
// mocked — it fetches from the backend in a useEffect (never runs under
// static render) and pulls framer-motion — with a stub that honours the
// picker's exact contract (isOpen/onClose/onSelectTemplate/variant).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ThreadComposer,
  applyThreadTemplateToDraft,
  mergeSavedTemplateIntoDraft,
} from '../components/ThreadComposer';

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock('../components/InboxToast', () => ({ showToast: vi.fn() }));
// The picker is portaled and closed on first render, so the mock never
// appears in these assertions — it exists only to keep framer-motion out of
// the module graph.
vi.mock('../components/EmailTemplates', () => ({
  EmailTemplates: () => null,
}));

function makeConversation(overrides: Record<string, unknown> = {}) {
  const lastMessage = {
    id: 'msg-9',
    subject: 'Hi there',
    from: { email: 'ada@x.com', name: 'Ada' },
    to: [{ email: 'me@quantmail.in' }],
  };
  return {
    personKey: 'ada',
    name: 'Ada',
    email: 'ada@x.com',
    messages: [lastMessage],
    lastMessage,
    lastActivityAt: new Date('2026-10-10T10:00:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: ['ada@x.com'],
    ...overrides,
  };
}

function renderComposer() {
  return renderToStaticMarkup(
    <ThreadComposer conversation={makeConversation() as any} currentUserId="user-1" />,
  );
}

const sampleTemplate = {
  id: 't1',
  name: 'Quick intro',
  subject: 'Intro',
  body: 'Hi — quick intro.',
  category: 'custom',
  createdAt: '2026-10-01T00:00:00Z',
  shortcut: null,
} as const;

describe('mergeSavedTemplateIntoDraft', () => {
  it('replaces an empty draft with the template body', () => {
    expect(mergeSavedTemplateIntoDraft('', 'Hi — quick intro.')).toBe('Hi — quick intro.');
  });

  it('replaces a whitespace-only draft (never ships a leading blank line)', () => {
    expect(mergeSavedTemplateIntoDraft('   \n  ', 'Hi — quick intro.')).toBe('Hi — quick intro.');
  });

  it('appends to a non-empty draft with a blank-line separator (never clobbers user text)', () => {
    expect(mergeSavedTemplateIntoDraft('My own words', 'Hi — quick intro.')).toBe(
      'My own words\n\nHi — quick intro.',
    );
  });
});

describe('applyThreadTemplateToDraft', () => {
  it('fills the new-topic subject only when it is empty (non-destructive)', () => {
    const next = applyThreadTemplateToDraft({
      body: '',
      newTopic: true,
      customSubject: '',
      template: { ...sampleTemplate },
    });
    expect(next.body).toBe('Hi — quick intro.');
    expect(next.customSubject).toBe('Intro');
  });

  it('never clobbers a typed new-topic subject', () => {
    const next = applyThreadTemplateToDraft({
      body: '',
      newTopic: true,
      customSubject: 'My own topic',
      template: { ...sampleTemplate },
    });
    expect(next.customSubject).toBe('My own topic');
  });

  it('leaves the subject alone in the default Re: mode (thread subject is automatic)', () => {
    const next = applyThreadTemplateToDraft({
      body: 'typing…',
      newTopic: false,
      customSubject: '',
      template: { ...sampleTemplate },
    });
    expect(next.body).toBe('typing…\n\nHi — quick intro.');
    expect(next.customSubject).toBe('');
  });

  it('never fakes attachments/CC/BCC — only body (+ new-topic subject) change', () => {
    const next = applyThreadTemplateToDraft({
      body: '',
      newTopic: false,
      customSubject: '',
      template: { ...sampleTemplate },
    });
    expect(Object.keys(next).sort()).toEqual(['body', 'customSubject']);
  });
});

describe('ThreadComposer templates affordance', () => {
  it('renders an accessible templates button in the chat bar', () => {
    const html = renderComposer();
    expect(html).toContain('aria-label="Insert a saved email template"');
    expect(html).toContain('title="Insert a saved email template"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('gives the templates button a 44px touch target like its neighbours', () => {
    const html = renderComposer();
    expect(html).toMatch(/aria-label="Insert a saved email template"[^>]*min-h-\[44px\]/);
  });

  it('does not render the picker until it is opened (portaled on demand)', () => {
    const html = renderComposer();
    expect(html).not.toContain('Saved email templates');
    expect(html).not.toContain('role="dialog"');
  });

  it('promises nothing the backend cannot deliver — no attachment/CC/BCC claims', () => {
    const html = renderComposer().toLowerCase();
    expect(html).not.toContain('attachment');
    expect(html).not.toContain('cc/bcc');
    expect(html).not.toContain('?token=');
  });

  it('keeps the existing composer surface intact (no regressions in the row)', () => {
    const html = renderComposer();
    expect(html).toContain('Message Ada…');
    expect(html).toContain('New topic');
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain('Replying: Re: Hi there');
  });
});
