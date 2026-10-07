// ============================================================================
// QuantMail - Calendar Grid Component
// Calendar grid with date cells, event chips, overflow, drag handles
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  color: string;
  isAllDay: boolean;
  category: string;
}

interface CalendarGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onEventDrop?: (eventId: string, newDate: Date) => void;
  onCreateEvent?: (date: Date) => void;
  maxEventsPerCell?: number;
  showWeekNumbers?: boolean;
  highlightToday?: boolean;
  weekStartsOn?: 0 | 1;
}

interface CellData {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
  weekNumber?: number;
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_MON_START = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  year,
  month,
  events,
  onDateClick,
  onEventClick,
  onEventDrop,
  onCreateEvent,
  maxEventsPerCell = 3,
  showWeekNumbers = false,
  highlightToday = true,
  weekStartsOn = 0
}) => {
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [showMorePopup, setShowMorePopup] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const dayHeaders = useMemo(() => weekStartsOn === 1 ? DAYS_MON_START : DAYS_SHORT, [weekStartsOn]);

  const cells = useMemo((): CellData[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() - weekStartsOn + 7) % 7;
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const result: CellData[] = [];

    for (let i = 0; i < totalCells; i++) {
      const date = new Date(year, month, 1 - startOffset + i);
      const dateStr = date.toISOString().split('T')[0];
      const cellEvents = events.filter(e => {
        const eventDate = new Date(e.startTime).toISOString().split('T')[0];
        return eventDate === dateStr;
      });

      result.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: highlightToday && date.getTime() === today.getTime(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        events: cellEvents,
        weekNumber: showWeekNumbers && date.getDay() === weekStartsOn ? getWeekNumber(date) : undefined,
      });
    }
    return result;
  }, [year, month, events, weekStartsOn, highlightToday, showWeekNumbers]);

  const handleDragStart = useCallback((e: React.DragEvent, eventId: string) => {
    e.stopPropagation();
    setDraggedEventId(eventId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', eventId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(date.toISOString());
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, date: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    if (draggedEventId && onEventDrop) {
      onEventDrop(draggedEventId, date);
    }
    setDraggedEventId(null);
  }, [draggedEventId, onEventDrop]);

  const handleCellClick = useCallback((date: Date, e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cell-date-num')) {
      if (onDateClick) onDateClick(date);
    }
  }, [onDateClick]);

  const handleCellDoubleClick = useCallback((date: Date) => {
    if (onCreateEvent) onCreateEvent(date);
  }, [onCreateEvent]);

  const handleEventClick = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEventClick) onEventClick(event);
  }, [onEventClick]);

  const handleShowMore = useCallback((date: Date, eventsList: CalendarEvent[], e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMorePopup({ date, events: eventsList });
  }, []);

  const weeks = useMemo(() => {
    const result: CellData[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      result.push(cells.slice(i, i + 7));
    }
    return result;
  }, [cells]);

  return (
    <div className="calendar-grid-component">
      <div className="grid-header">
        {showWeekNumbers && <div className="week-num-header">Wk</div>}
        {dayHeaders.map(day => (
          <div key={day} className="day-header-cell">{day}</div>
        ))}
      </div>

      <div className="grid-body">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="grid-week-row">
            {showWeekNumbers && (
              <div className="week-number-cell">
                {week[0].weekNumber || getWeekNumber(week[0].date)}
              </div>
            )}
            {week.map((cell, dayIdx) => {
              const isDragTarget = dragOverDate === cell.date.toISOString();
              const visibleEvents = cell.events.slice(0, maxEventsPerCell);
              const overflowCount = cell.events.length - maxEventsPerCell;

              return (
                <div
                  key={dayIdx}
                  className={[
                    'grid-cell',
                    !cell.isCurrentMonth && 'other-month',
                    cell.isToday && 'today',
                    cell.isWeekend && 'weekend',
                    isDragTarget && 'drag-over',
                  ].filter(Boolean).join(' ')}
                  onClick={(e) => handleCellClick(cell.date, e)}
                  onDoubleClick={() => handleCellDoubleClick(cell.date)}
                  onDragOver={(e) => handleDragOver(e, cell.date)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, cell.date)}
                >
                  <span className={`cell-date-num ${cell.isToday ? 'today-num' : ''}`}>
                    {cell.date.getDate()}
                  </span>

                  <div className="cell-events-container">
                    {visibleEvents.map(event => (
                      <div
                        key={event.id}
                        className={`event-chip ${hoveredEvent === event.id ? 'hovered' : ''} ${draggedEventId === event.id ? 'dragging' : ''}`}
                        style={{ backgroundColor: event.color || '#4285f4', opacity: draggedEventId === event.id ? 0.5 : 1 }}
                        onClick={(e) => handleEventClick(event, e)}
                        onMouseEnter={() => setHoveredEvent(event.id)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, event.id)}
                        title={`${event.title}\n${new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      >
                        {!event.isAllDay && (
                          <span className="event-time">
                            {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        <span className="event-title">{event.title}</span>
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <button className="more-events-btn" onClick={(e) => handleShowMore(cell.date, cell.events, e)}>
                        +{overflowCount} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {showMorePopup && (
        <div className="more-popup-overlay" onClick={() => setShowMorePopup(null)}>
          <div className="more-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <span>{showMorePopup.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              <button onClick={() => setShowMorePopup(null)} className="close-popup">\u2715</button>
            </div>
            <div className="popup-events">
              {showMorePopup.events.map(event => (
                <div key={event.id} className="popup-event-item" style={{ borderLeftColor: event.color }} onClick={() => { if (onEventClick) onEventClick(event); setShowMorePopup(null); }}>
                  <span className="popup-event-time">{new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="popup-event-title">{event.title}</span>
                  <span className="popup-event-category">{event.category}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarGrid;
