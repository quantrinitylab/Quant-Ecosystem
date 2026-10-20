// fix/qm-calendar-drag-reschedule-guest-notify — pins the drag-reschedule
// guest-notification contract: no prompt (and no sendUpdate key) when there
// are no attendees; sendUpdate: true on confirm; sendUpdate: false on
// decline. The prompt copy must match the edit sheet's "Send update to
// guests?" wording exactly.
import { describe, it, expect, vi } from 'vitest';
import { buildReschedulePayload } from '../reschedule-guest-prompt';
import type { ConfirmOptions } from '../../../../hooks/useConfirm';
import type { CalendarEventLike } from '../../types';

const START = new Date(2026, 9, 8, 14, 0, 0);
const END = new Date(2026, 9, 8, 15, 0, 0);

function makeEvent(over: Partial<CalendarEventLike> = {}): CalendarEventLike {
  return {
    id: 'ev-test',
    title: 'Team sync',
    startTime: new Date(2026, 9, 7, 10, 0).toISOString(),
    endTime: new Date(2026, 9, 7, 11, 0).toISOString(),
    ...over,
  };
}

function confirmStub(answer: boolean) {
  return vi.fn(async (_options: ConfirmOptions) => answer);
}

describe('buildReschedulePayload', () => {
  it('no attendees → no prompt and no sendUpdate key in the payload', async () => {
    const confirm = confirmStub(true);
    const payload = await buildReschedulePayload(makeEvent({ attendees: [] }), START, END, confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(payload).toEqual({
      startTime: START.toISOString(),
      endTime: END.toISOString(),
    });
    expect('sendUpdate' in payload).toBe(false);
  });

  it('missing attendees field → no prompt and no sendUpdate key', async () => {
    const event = makeEvent();
    delete event.attendees;
    const confirm = confirmStub(true);
    const payload = await buildReschedulePayload(event, START, END, confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect('sendUpdate' in payload).toBe(false);
  });

  it('attendees + confirm → sendUpdate: true, prompt reuses the edit-sheet copy', async () => {
    const confirm = confirmStub(true);
    const payload = await buildReschedulePayload(
      makeEvent({ attendees: ['a@example.com', 'b@example.com'] }),
      START,
      END,
      confirm,
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    const options = confirm.mock.calls[0]![0]!;
    expect(options.title).toBe('Send update to guests?');
    expect(options.message).toBe(
      '“Team sync” has 2 guests. Send them an updated invitation by email?',
    );
    expect(options.confirmLabel).toBe('Send update');
    expect(options.cancelLabel).toBe("Don't send");
    expect(payload.startTime).toBe(START.toISOString());
    expect(payload.endTime).toBe(END.toISOString());
    expect(payload.sendUpdate).toBe(true);
  });

  it('attendees + decline → sendUpdate: false (the move still persists)', async () => {
    const confirm = confirmStub(false);
    const payload = await buildReschedulePayload(
      makeEvent({ attendees: ['a@example.com'] }),
      START,
      END,
      confirm,
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    // Singular guest copy, no "guests".
    expect(confirm.mock.calls[0]![0]!.message).toBe(
      '“Team sync” has 1 guest. Send them an updated invitation by email?',
    );
    expect(payload.sendUpdate).toBe(false);
    expect(payload.startTime).toBe(START.toISOString());
    expect(payload.endTime).toBe(END.toISOString());
  });

  it('blank title falls back to "Untitled event" in the prompt', async () => {
    const confirm = confirmStub(true);
    await buildReschedulePayload(
      makeEvent({ title: '   ', attendees: ['a@example.com'] }),
      START,
      END,
      confirm,
    );
    expect(confirm.mock.calls[0]![0]!.message).toContain('“Untitled event” has 1 guest.');
  });

  it('legacy non-email attendee values do not trigger the prompt or count as guests', async () => {
    const confirm = confirmStub(true);
    const payload = await buildReschedulePayload(
      makeEvent({ attendees: ['Room 5', '', 'not-an-email', { email: 42 } as unknown as string] }),
      START,
      END,
      confirm,
    );
    // The backend never emails these, so the prompt must not appear at all.
    expect(confirm).not.toHaveBeenCalled();
    expect('sendUpdate' in payload).toBe(false);
  });

  it('guest count excludes non-email entries when real guests exist', async () => {
    const confirm = confirmStub(true);
    await buildReschedulePayload(
      makeEvent({ attendees: ['a@example.com', 'Room 5', ''] }),
      START,
      END,
      confirm,
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]!.message).toBe(
      '“Team sync” has 1 guest. Send them an updated invitation by email?',
    );
  });
});
