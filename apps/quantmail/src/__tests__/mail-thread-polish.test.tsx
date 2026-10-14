// @vitest-environment jsdom
// Mail thread polish (live desktop walkthrough 2026-10-14):
//   • "To:" in the message details read "qwlive20261013" — a bare local part
//     that looks like a broken address — while "From:" showed Name <address>;
//   • the Quick replies "Sources" row rendered as one run-on body-size line
//     ("SourcesDesign review notes from Priya") because its classes had no CSS;
//   • the hover reply/react pill covered the first letters of the sender name.
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/InboxToast', () => ({ showToast: vi.fn() }));

import { formatHeaderAddress } from '../components/ConversationalThreadView';
import { ThreadBubbleShell } from '../components/ThreadBubbleGestures';
import { QuantyEvidenceLinks } from '../components/QuantyEvidenceLinks';
import type { Email } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): { container: HTMLDivElement } {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
  return { container: host };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('formatHeaderAddress (message details To:/Cc:)', () => {
  it('shows Name <address> when the name adds something', () => {
    expect(formatHeaderAddress({ name: 'Priya Peer', email: 'qwpeer20261013@quantmail.in' })).toBe(
      'Priya Peer <qwpeer20261013@quantmail.in>',
    );
  });

  it('shows the full address when the name is only its local part or the address', () => {
    expect(formatHeaderAddress({ name: 'qwlive20261013', email: 'qwlive20261013@quantmail.in' })).toBe(
      'qwlive20261013@quantmail.in',
    );
    expect(formatHeaderAddress({ name: 'A@Quantmail.in', email: 'a@quantmail.in' })).toBe('a@quantmail.in');
    expect(formatHeaderAddress({ email: 'b@quantmail.in' })).toBe('b@quantmail.in');
  });

  it('falls back to the name when there is no address', () => {
    expect(formatHeaderAddress({ name: 'Team list' })).toBe('Team list');
  });
});

describe('Quanty evidence ("Sources") styling', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

  it('has a rule for every class the component emits', () => {
    const { container } = render(
      <QuantyEvidenceLinks evidence={[{ label: 'Design review notes from Priya' }]} />,
    );
    const classes = new Set<string>();
    container.querySelectorAll('[class]').forEach((el) => {
      el.classList.forEach((c) => {
        if (c.startsWith('quanty-evidence')) classes.add(c);
      });
    });
    expect([...classes].sort()).toEqual([
      'quanty-evidence',
      'quanty-evidence-caption',
      'quanty-evidence-chip',
      'quanty-evidence-inline',
    ]);
    for (const c of classes) {
      expect(css, `.${c} needs a rule in globals.css`).toMatch(new RegExp(`\\.${c}\\s*\\{`));
    }
  });

  it('keeps the caption and the source label as separate elements', () => {
    const { container } = render(
      <QuantyEvidenceLinks evidence={[{ label: 'Design review notes from Priya' }]} />,
    );
    const chip = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === 'Design review notes from Priya',
    )!;
    expect(chip.className).toContain('quanty-evidence-chip');
    expect(chip.textContent).toBe('Design review notes from Priya');
  });
});

describe('bubble hover pill geometry', () => {
  const message = { id: 'm1', from: { name: 'Priya Peer', email: 'p@quantmail.in' } } as unknown as Email;

  it('sits above the row (not over the sender name) with compact buttons', () => {
    const { container } = render(
      <ThreadBubbleShell message={message} senderName="Priya Peer" isOutbound={false} onQuoteReply={vi.fn()}>
        <p>body</p>
      </ThreadBubbleShell>,
    );
    const pill = container.querySelector('[data-testid="bubble-hover-actions"]') as HTMLElement;
    expect(pill.className).toContain('-top-5');
    expect(pill.className).not.toContain('-top-3');
    expect(pill.className).toContain('left-3');
    const reply = container.querySelector(
      'button[aria-label="Reply to message from Priya Peer"]',
    ) as HTMLElement;
    expect(reply.className).toContain('size-7');
  });
});
