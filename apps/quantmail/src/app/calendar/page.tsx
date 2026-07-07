'use client';

import { useState, useCallback, useMemo } from 'react';
import { AppShell, Card, Button, Modal, Input, FormField, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import {
  useCalendarEvents,
  useCreateEvent,
  useDeleteEvent,
} from '../../hooks/useCalendar';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '',
    endTime: '',
    description: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 0).toISOString();

  const { data: events, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const daysInMonth = useMemo(() => {
    const d = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { total: d, offset: firstDay };
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, number> = {};
    if (events) {
      for (const event of events) {
        const day = new Date(event.startTime).getDate();
        map[day] = (map[day] || 0) + 1;
      }
    }
    return map;
  }, [events]);

  const handlePrevMonth = useCallback(() => {
    setCurrentDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const handleNextMonth = useCallback(() => {
    setCurrentDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const handleCreateEvent = useCallback(async () => {
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime) return;
    await createEvent.mutateAsync({
      title: newEvent.title,
      startTime: newEvent.startTime,
      endTime: newEvent.endTime,
      description: newEvent.description,
    });
    setShowCreateModal(false);
    setNewEvent({ title: '', startTime: '', endTime: '', description: '' });
  }, [newEvent, createEvent]);

  const handleDeleteEvent = useCallback(
    async (id: string) => {
      await deleteEvent.mutateAsync(id);
    },
    [deleteEvent],
  );

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handlePrevMonth}>
              Prev
            </Button>
            <h1 className="text-lg font-semibold">{monthName}</h1>
            <Button variant="secondary" onClick={handleNextMonth}>
              Next
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-[var(--quant-border)] overflow-hidden">
              {(['month', 'week'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    viewMode === v
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              Create Event
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading && (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="60px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && (
            <>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 mb-6">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-[var(--quant-muted-foreground)] py-2"
                  >
                    {d}
                  </div>
                ))}
                {Array.from({ length: daysInMonth.offset }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth.total }).map((_, i) => {
                  const day = i + 1;
                  const isToday =
                    day === new Date().getDate() &&
                    month === new Date().getMonth() &&
                    year === new Date().getFullYear();
                  const isSelected = day === selectedDay;
                  const count = eventsByDay[day] || 0;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`p-2 text-center rounded-lg text-sm transition-all cursor-pointer ${
                        isSelected && !isToday
                          ? 'bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/40 font-medium text-[var(--quant-foreground)]'
                          : isToday
                            ? 'bg-[var(--brand-primary)] text-white font-bold shadow-sm'
                            : 'hover:bg-[var(--quant-muted)] text-[var(--quant-foreground)]'
                      }`}
                    >
                      {day}
                      {count > 0 && (
                        <div className="flex justify-center gap-0.5 mt-1">
                          {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                            <span
                              key={j}
                              className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white/70' : 'bg-[var(--brand-primary)]'}`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected day events */}
              <div>
                <h2 className="text-base font-semibold text-[var(--quant-foreground)] mb-3">
                  {selectedDay === new Date().getDate() &&
                  month === new Date().getMonth() &&
                  year === new Date().getFullYear()
                    ? 'Today'
                    : `${new Date(year, month, selectedDay).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                </h2>
                {(() => {
                  const dayEvents = events?.filter((e) => {
                    const d = new Date(e.startTime).getDate();
                    return d === selectedDay;
                  }) ?? [];
                  if (dayEvents.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <div className="w-12 h-12 rounded-full bg-[var(--quant-muted)] flex items-center justify-center mx-auto mb-3">
                          <span className="text-xl opacity-50">📅</span>
                        </div>
                        <p className="text-sm text-[var(--quant-muted-foreground)]">No events</p>
                        <button
                          className="mt-2 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                          onClick={() => setShowCreateModal(true)}
                        >
                          + Add event for this day
                        </button>
                      </div>
                    );
                  }
                  return dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="mb-2 flex items-center gap-3 p-3 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-muted)] transition-colors"
                    >
                      <div className="w-1 h-10 rounded-full bg-[var(--brand-primary)]" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-[var(--quant-foreground)] truncate">
                          {event.title}
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          {new Date(event.startTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' – '}
                          {new Date(event.endTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                      </div>
                      <button
                        className="text-xs text-[var(--quant-destructive)] hover:underline"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
        </div>

        {/* Create Event Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Event"
        >
          <div className="space-y-4">
            <FormField label="Title" required>
              <Input
                value={newEvent.title}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Event title"
              />
            </FormField>
            <FormField label="Start Time" required>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-[var(--quant-border)] bg-transparent px-3 py-2 text-sm"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, startTime: e.target.value }))}
              />
            </FormField>
            <FormField label="End Time" required>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-[var(--quant-border)] bg-transparent px-3 py-2 text-sm"
                value={newEvent.endTime}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, endTime: e.target.value }))}
              />
            </FormField>
            <FormField label="Description">
              <Input
                value={newEvent.description}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateEvent}>
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
