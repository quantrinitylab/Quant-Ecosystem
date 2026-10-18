// ============================================================================
// RSVP pre-write confirmation gate — CODEX-REVIEW follow-up on #1100.
//
// The v1 contract writes every RSVP to the series-level attendee list, but
// the old UI POSTed first and explained the scope only AFTER success. These
// tests pin the corrected contract:
//   - planRsvpWrite: a recurring series (from an occurrence page OR the
//     series page) requires explicit confirmation BEFORE any POST; a
//     non-recurring event posts directly.
//   - createRsvpWriteGate: no POST before confirmation, Cancel produces no
//     POST, Confirm posts exactly once (double-tap/key-repeat safe).
//   - buildRsvpPreWriteCopy: future-tense ("will apply"), never claims a
//     per-occurrence write, names the occurrence the user responded from.
//   - RsvpScopePrewriteConfirmation: accessible dialog with explicit
//     Confirm/Cancel; pending state locks both actions.
//
// renderToStaticMarkup (no @testing-library/react — CI runs
// pnpm install --frozen-lockfile and the package is not a dependency).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  planRsvpWrite,
  createRsvpWriteGate,
  buildRsvpPreWriteCopy,
  type RsvpScopeInfo,
} from '../event-detail-utils';
import { RsvpScopePrewriteConfirmation } from '../rsvp-scope-prewrite-confirmation';

const RECURRING = 'FREQ=WEEKLY';
const OCCURRENCE_ID = 'e1_2026-10-15T09:00:00.000Z';

const SERIES_SCOPE: RsvpScopeInfo = {
  kind: 'occurrence',
  appliesTo: 'series',
  fromOccurrence: '2026-10-15T09:00:00.000Z',
};

describe('planRsvpWrite', () => {
  it('requires pre-confirmation from an occurrence page of a recurring series', () => {
    const intent = planRsvpWrite(OCCURRENCE_ID, RECURRING);
    expect(intent.requiresPreConfirm).toBe(true);
    expect(intent.scope.appliesTo).toBe('series');
  });

  it('requires pre-confirmation from the series page of a recurring series', () => {
    const intent = planRsvpWrite('e1', RECURRING);
    expect(intent.requiresPreConfirm).toBe(true);
    expect(intent.scope).toEqual({
      kind: 'event',
      appliesTo: 'series',
      fromOccurrence: null,
    });
  });

  it('posts directly for a non-recurring event — no scope surprise possible', () => {
    expect(planRsvpWrite('e1', null).requiresPreConfirm).toBe(false);
    expect(planRsvpWrite('e1', undefined).requiresPreConfirm).toBe(false);
  });

  it('posts directly when there is no recurrence even with an occurrence-shaped id', () => {
    expect(planRsvpWrite(OCCURRENCE_ID, null).requiresPreConfirm).toBe(false);
  });
});

describe('buildRsvpPreWriteCopy', () => {
  it('states the authoritative effect in future tense', () => {
    const copy = buildRsvpPreWriteCopy('accepted', SERIES_SCOPE, 'Wed, Oct 15 · 2:30 PM');
    expect(copy).toContain('Accepted');
    expect(copy).toContain('will apply to the entire series');
    expect(copy).toContain('Wed, Oct 15 · 2:30 PM');
  });

  it('names the series-wide effect from the series page too', () => {
    const copy = buildRsvpPreWriteCopy('declined', {
      kind: 'event',
      appliesTo: 'series',
      fromOccurrence: null,
    });
    expect(copy).toContain('Declined');
    expect(copy).toContain('will apply to the entire series');
  });

  it('never claims a per-occurrence write', () => {
    const copy = buildRsvpPreWriteCopy('tentative', SERIES_SCOPE, 'Wed, Oct 15 · 2:30 PM');
    expect(copy).not.toMatch(/only this occurrence|just this occurrence|this occurrence only/i);
  });
});

describe('createRsvpWriteGate', () => {
  function setup() {
    const post = vi.fn(async () => ({ ok: true }));
    const gate = createRsvpWriteGate({ post });
    return { post, gate };
  }

  it('posts immediately for a non-recurring event (request returns false)', () => {
    const { post, gate } = setup();
    const needsConfirm = gate.request('accepted', planRsvpWrite('e1', null));
    expect(needsConfirm).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('accepted');
  });

  it('posts NOTHING before confirmation for a recurring series', () => {
    const { post, gate } = setup();
    const needsConfirm = gate.request('accepted', planRsvpWrite(OCCURRENCE_ID, RECURRING));
    expect(needsConfirm).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('Cancel produces zero mutation', () => {
    const { post, gate } = setup();
    gate.request('declined', planRsvpWrite(OCCURRENCE_ID, RECURRING));
    gate.cancel();
    expect(post).not.toHaveBeenCalled();
    // A confirm after cancel is a no-op too — nothing is pending.
    expect(gate.confirm()).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('Confirm posts exactly once — double-tap/key-repeat are no-ops', async () => {
    const { post, gate } = setup();
    gate.request('tentative', planRsvpWrite(OCCURRENCE_ID, RECURRING));
    const first = gate.confirm();
    expect(first).not.toBeNull();
    await first;
    const second = gate.confirm();
    expect(second).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('a fresh request after cancel arms a new one-shot intent', async () => {
    const { post, gate } = setup();
    gate.request('accepted', planRsvpWrite(OCCURRENCE_ID, RECURRING));
    gate.cancel();
    gate.request('declined', planRsvpWrite(OCCURRENCE_ID, RECURRING));
    await gate.confirm();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('declined');
  });
});

describe('RsvpScopePrewriteConfirmation', () => {
  function renderDialog(isPending = false) {
    return renderToStaticMarkup(
      <RsvpScopePrewriteConfirmation
        status="accepted"
        scope={SERIES_SCOPE}
        timeZone="Asia/Kolkata"
        isPending={isPending}
        openerRef={{ current: null }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
  }

  it('renders an accessible dialog naming the series-wide effect', () => {
    const html = renderDialog();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Confirm your response');
    expect(html).toContain('will apply to the entire series');
    expect(html).toContain('Oct');
  });

  it('offers explicit Confirm and Cancel actions', () => {
    const html = renderDialog();
    expect(html).toContain('Confirm — Accepted');
    expect(html).toContain('Cancel');
  });

  it('locks both actions while the mutation is pending', () => {
    const html = renderDialog(true);
    expect(html).toContain('Sending…');
    // Both buttons disabled while pending.
    const disabledCount = (html.match(/disabled=""/g) || []).length;
    expect(disabledCount).toBe(2);
  });
});
