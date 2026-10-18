// @vitest-environment node
// ============================================================================
// fix/qm-quant-meta-strip — in-calendar event detail modal must never render
// the raw __QUANT_META__ description header.
//
// The modal used to render `selectedEvent.description` verbatim, so the
// backend's `__QUANT_META__:{...}:__END_QUANT_META__` JSON blob showed above
// the user's text. The standalone event-detail page already strips it via
// event-detail-utils stripQuantMeta; the modal now mirrors that behaviour.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// The real Modal renders through a React portal, which renderToStaticMarkup
// does not support — stand in with a faithful non-portal shell that renders
// its children only while open.
vi.mock('@quant/shared-ui', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? <div data-testid="modal" data-title={title}>{children}</div> : null,
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

import { CalendarModals } from '../app/calendar/components/CalendarModals';
import type { CalendarEventLike, FormState } from '../app/calendar/types';

const OLD_HEADER = '__QUANT_META__:{"type":"event","priority":"high"}:__END_QUANT_META__';

const BASE_EVENT: CalendarEventLike = {
  id: 'evt-1',
  title: 'Design review',
  startTime: '2026-10-18T09:00:00.000Z',
  endTime: '2026-10-18T10:00:00.000Z',
  allDay: false,
};

function renderModal(selectedEvent: CalendarEventLike | null) {
  const noop = vi.fn();
  const formState = {
    recurrence: 'Does not repeat',
    periodDays: 5,
    cycleLength: 28,
  } as unknown as FormState;
  return renderToStaticMarkup(
    <CalendarModals
      isPeriodCustomizeOpen={false}
      setIsPeriodCustomizeOpen={noop}
      formState={formState}
      setFormState={noop}
      isTimezoneModalOpen={false}
      setIsTimezoneModalOpen={noop}
      isRecurrenceModalOpen={false}
      setIsRecurrenceModalOpen={noop}
      isNotificationSliderOpen={false}
      setIsNotificationSliderOpen={noop}
      notifSliderIndex={0}
      setNotifSliderIndex={noop}
      addNotificationReminder={noop}
      selectedEvent={selectedEvent}
      setSelectedEvent={noop}
      openEditSheet={noop}
      handleDeleteEvent={noop}
    />,
  );
}

describe('CalendarModals — event detail inspector strips __QUANT_META__', () => {
  it('hides the stored header but shows the user body text', () => {
    const html = renderModal({
      ...BASE_EVENT,
      description: `${OLD_HEADER}\nWalk through the new inbox.`,
    });
    expect(html).toContain('Walk through the new inbox.');
    expect(html).not.toContain('__QUANT_META__');
    expect(html).not.toContain('"priority":"high"');
  });

  it('renders no description block for a header-only description (honest empty state)', () => {
    const html = renderModal({ ...BASE_EVENT, description: OLD_HEADER });
    expect(html).not.toContain('__QUANT_META__');
    // The description div is the only block with this exact styling pair.
    expect(html).not.toContain('pt-2 border-t border-[var(--quant-surface-elevated)]');
  });

  it('renders a plain header-free description verbatim (no regression)', () => {
    const html = renderModal({ ...BASE_EVENT, description: 'Just a plain note.' });
    expect(html).toContain('Just a plain note.');
  });

  it('renders nothing for the modal when no event is selected', () => {
    const html = renderModal(null);
    expect(html).not.toContain('data-testid="modal"');
  });
});
