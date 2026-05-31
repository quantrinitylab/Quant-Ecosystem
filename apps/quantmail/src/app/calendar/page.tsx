'use client';

import { useState, useCallback, useMemo } from 'react';
import { AppShell, Card, Button, Modal, Input, FormField, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import {
  useCalendarEvents,
  useTodayEvents,
  useCreateEvent,
  useDeleteEvent,
} from '../../hooks/useCalendar';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
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
  const { data: todayEvents } = useTodayEvents();
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
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            Create Event
          </Button>
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
                  const count = eventsByDay[day] || 0;
                  return (
                    <div
                      key={day}
                      className={`p-2 text-center rounded-md text-sm ${
                        isToday
                          ? 'bg-[var(--quant-primary)] text-white font-bold'
                          : 'hover:bg-[var(--quant-muted)]'
                      }`}
                    >
                      {day}
                      {count > 0 && (
                        <div className="flex justify-center gap-0.5 mt-1">
                          {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                            <span
                              key={j}
                              className="w-1.5 h-1.5 rounded-full bg-[var(--quant-primary)]"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Today's events */}
              <div>
                <h2 className="text-lg font-semibold mb-3">Today</h2>
                {(!todayEvents || todayEvents.length === 0) && (
                  <EmptyState title="No events today" description="Enjoy your free day" />
                )}
                {todayEvents?.map((event) => (
                  <Card key={event.id} className="mb-2 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-sm">{event.title}</h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)]">
                          {new Date(event.startTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' - '}
                          {new Date(event.endTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Button variant="secondary" onClick={() => handleDeleteEvent(event.id)}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
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
