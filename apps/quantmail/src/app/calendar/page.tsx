'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button, Modal, Input, FormField, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { holidaysForMonth, type Holiday } from '../../lib/holidays';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEventLike {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  start?: string;
  end?: string;
  location?: string;
  allDay?: boolean;
}

const startOf = (event: CalendarEventLike) => new Date(event.startTime ?? event.start ?? '');
const endOf = (event: CalendarEventLike) => new Date(event.endTime ?? event.end ?? '');
const hhmm = (date: Date) =>
  Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function CalendarPage() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '',
    endTime: '',
    location: '',
    description: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: events, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const grid = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    return { total, offset, trailing: (7 - ((offset + total) % 7)) % 7 };
  }, [year, month]);

  const holidays = useMemo(() => holidaysForMonth(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEventLike[]> = {};
    for (const event of (events ?? []) as unknown as CalendarEventLike[]) {
      const date = startOf(event);
      if (Number.isNaN(date.getTime())) continue;
      if (date.getFullYear() !== year || date.getMonth() !== month) continue;
      const day = date.getDate();
      map[day] = [...(map[day] ?? []), event];
    }
    for (const day of Object.keys(map)) {
      map[Number(day)]!.sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
    }
    return map;
  }, [events, year, month]);

  const goMonth = useCallback(
    (delta: number) => setCurrentDate(new Date(year, month + delta, 1)),
    [year, month],
  );

  const goToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now.getDate());
  }, []);

  const openCreate = useCallback(
    (day?: number) => {
      const base = new Date(year, month, day ?? selectedDay, 10, 0, 0);
      const later = new Date(base.getTime() + 60 * 60 * 1000);
      const local = (date: Date) =>
        `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
      setNewEvent({
        title: '',
        startTime: local(base),
        endTime: local(later),
        location: '',
        description: '',
      });
      setShowCreateModal(true);
    },
    [year, month, selectedDay],
  );

  const handleCreateEvent = useCallback(async () => {
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime) return;
    await createEvent.mutateAsync({
      title: newEvent.title,
      startTime: new Date(newEvent.startTime).toISOString(),
      endTime: new Date(newEvent.endTime).toISOString(),
      description: newEvent.description,
      location: newEvent.location,
    } as never);
    setShowCreateModal(false);
  }, [newEvent, createEvent]);

  const monthName = currentDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedDate = new Date(year, month, selectedDay);
  const selectedEvents = eventsByDay[selectedDay] ?? [];
  const selectedHolidays = holidays[selectedDay] ?? [];

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page calendar-workspace flex flex-col h-full">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--quant-border)] p-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              ‹
            </button>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              ›
            </button>
            <h1 className="truncate text-lg font-semibold tracking-tight">{monthName}</h1>
            <button
              onClick={goToday}
              className="ml-1 shrink-0 rounded-lg border border-[var(--quant-border)] px-2.5 py-1 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              Today
            </button>
          </div>
          <Button variant="primary" onClick={() => openCreate()}>
            Create Event
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading && (
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="96px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && (
            <>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]"
                  >
                    {d}
                  </div>
                ))}

                {Array.from({ length: grid.offset }).map((_, i) => (
                  <div
                    key={`lead-${i}`}
                    className="min-h-[92px] rounded-xl border border-dashed border-[var(--quant-border)]/50"
                  />
                ))}

                {Array.from({ length: grid.total }).map((_, i) => {
                  const day = i + 1;
                  const isToday =
                    day === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
                  const isSelected = day === selectedDay;
                  const dayEvents = eventsByDay[day] ?? [];
                  const dayHolidays = holidays[day] ?? [];
                  const weekend = new Date(year, month, day).getDay() % 6 === 0;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      onDoubleClick={() => openCreate(day)}
                      className={`flex min-h-[92px] flex-col gap-1 rounded-xl border p-2 text-left transition-all ${
                        isSelected
                          ? 'border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10'
                          : 'border-[var(--quant-border)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--quant-muted)]'
                      } ${weekend && !isSelected ? 'bg-[var(--quant-surface)]/60' : ''}`}
                    >
                      <span className="flex items-center justify-between">
                        <span
                          className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold ${
                            isToday
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'text-[var(--quant-foreground)]'
                          }`}
                        >
                          {day}
                        </span>
                        {dayEvents.length > 2 && (
                          <span className="text-[10px] font-medium text-[var(--quant-muted-foreground)]">
                            +{dayEvents.length - 2}
                          </span>
                        )}
                      </span>

                      {dayHolidays.map((holiday) => (
                        <HolidayChip key={holiday.name} holiday={holiday} />
                      ))}

                      {dayEvents.slice(0, 2).map((event) => (
                        <span
                          key={event.id}
                          className="flex items-center gap-1 truncate rounded-md bg-[var(--brand-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--quant-foreground)]"
                          title={event.title}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                          <span className="truncate">
                            {event.allDay ? '' : `${hhmm(startOf(event))} `}
                            {event.title}
                          </span>
                        </span>
                      ))}
                    </button>
                  );
                })}

                {Array.from({ length: grid.trailing }).map((_, i) => (
                  <div
                    key={`trail-${i}`}
                    className="min-h-[92px] rounded-xl border border-dashed border-[var(--quant-border)]/50"
                  />
                ))}
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h2>
                  <button
                    onClick={() => openCreate(selectedDay)}
                    className="rounded-lg border border-[var(--quant-border)] px-2.5 py-1 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
                  >
                    Add event
                  </button>
                </div>

                {selectedHolidays.map((holiday) => (
                  <div
                    key={holiday.name}
                    className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3"
                  >
                    <span className="h-8 w-1 rounded-full bg-[var(--quant-warning,#f0b429)]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{holiday.name}</p>
                      <p className="text-xs capitalize text-[var(--quant-muted-foreground)]">
                        {holiday.kind === 'national' ? 'Public holiday' : holiday.kind}
                      </p>
                    </div>
                  </div>
                ))}

                {selectedEvents.length === 0 && selectedHolidays.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[var(--quant-border)] p-6 text-center text-sm text-[var(--quant-muted-foreground)]">
                    Nothing scheduled. Double-click any day to add an event.
                  </p>
                ) : (
                  selectedEvents.map((event) => (
                    <div
                      key={event.id}
                      className="mb-2 flex items-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3 transition-colors hover:bg-[var(--quant-muted)]"
                    >
                      <div className="h-10 w-1 rounded-full bg-[var(--brand-primary)]" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-[var(--quant-foreground)]">
                          {event.title}
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          {event.allDay
                            ? 'All day'
                            : `${hhmm(startOf(event))} – ${hhmm(endOf(event))}`}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                      </div>
                      <button
                        className="text-xs text-[var(--quant-destructive)] hover:underline"
                        onClick={() => void deleteEvent.mutateAsync(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="New event"
          description={selectedDate.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateEvent}
                disabled={!newEvent.title || createEvent.isPending}
              >
                {createEvent.isPending ? 'Saving…' : 'Save event'}
              </Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <FormField label="Title" required>
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Design review"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Starts" required>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-3 py-2 text-sm"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, startTime: e.target.value }))}
                />
              </FormField>
              <FormField label="Ends" required>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-[var(--quant-border)] bg-transparent px-3 py-2 text-sm"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, endTime: e.target.value }))}
                />
              </FormField>
            </div>
            <FormField label="Location">
              <Input
                value={newEvent.location}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Meet link or room"
              />
            </FormField>
            <FormField label="Notes">
              <Input
                value={newEvent.description}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Agenda, context, links"
              />
            </FormField>
            {createEvent.isError && (
              <p className="text-xs text-[var(--quant-destructive)]">
                {(createEvent.error as Error).message}
              </p>
            )}
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}

function HolidayChip({ holiday }: { holiday: Holiday }) {
  return (
    <span
      className="flex items-center gap-1 truncate rounded-md bg-[var(--quant-warning,#f0b429)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--quant-foreground)]"
      title={holiday.name}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--quant-warning,#f0b429)]" />
      <span className="truncate">{holiday.name}</span>
    </span>
  );
}
