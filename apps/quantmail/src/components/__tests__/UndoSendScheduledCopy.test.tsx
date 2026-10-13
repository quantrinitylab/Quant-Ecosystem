// @vitest-environment jsdom
// ============================================================================
// UndoSendCountdownBar honest copy for scheduled sends.
//
// A scheduled send rides the same 10-second recall window as a regular send
// (see the recall-window decision in UndoSendCountdownBar.tsx). The bar's
// copy must stay honest at every state: "Scheduling message to X…" while the
// window is open (there is nothing to "send" yet), and the caller's
// successLabel ("Email scheduled!") once the window closes — never the
// default "Message sent!" for a future schedule.
//
// These tests pin the copy contract via renderToStaticMarkup (CI has no
// @testing-library/react) against the REAL bar component in standalone
// (props) mode.
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  UndoSendCountdownBar,
  type PendingSendItem,
} from '../UndoSendCountdownBar';

const baseItem: PendingSendItem = {
  id: 'pending-1',
  queuedAt: Date.now(),
  to: 'kundan@quantmail.in',
  subject: 's',
  body: 'b',
};

const scheduledItem: PendingSendItem = {
  ...baseItem,
  scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
  successLabel: 'Email scheduled!',
};

describe('UndoSendCountdownBar scheduled-send copy', () => {
  it('counting state says "Scheduling message to" for a scheduled send', () => {
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        pendingItem={scheduledItem}
        status="counting"
        remainingSeconds={10}
        progressPercent={100}
      />,
    );
    expect(html).toContain('Scheduling message to');
    expect(html).not.toContain('Message sent!');
  });

  it('sending state says "Scheduling message to" for a scheduled send', () => {
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        pendingItem={scheduledItem}
        status="sending"
        remainingSeconds={0}
        progressPercent={0}
      />,
    );
    expect(html).toContain('Scheduling message to');
    expect(html).not.toContain('Message sent!');
  });

  it('sent state claims the caller successLabel, never "Message sent!"', () => {
    const html = renderToStaticMarkup(
      <UndoSendCountdownBar
        pendingItem={scheduledItem}
        status="sent"
        remainingSeconds={0}
        progressPercent={0}
      />,
    );
    expect(html).toContain('Email scheduled!');
    expect(html).not.toContain('Message sent!');
  });

  it('regular sends are unchanged: counting "Sending message to", sent "Message sent!"', () => {
    const counting = renderToStaticMarkup(
      <UndoSendCountdownBar
        pendingItem={baseItem}
        status="counting"
        remainingSeconds={10}
        progressPercent={100}
      />,
    );
    expect(counting).toContain('Sending message to');
    expect(counting).not.toContain('Scheduling message to');

    const sent = renderToStaticMarkup(
      <UndoSendCountdownBar
        pendingItem={baseItem}
        status="sent"
        remainingSeconds={0}
        progressPercent={0}
      />,
    );
    expect(sent).toContain('Message sent!');
  });
});
