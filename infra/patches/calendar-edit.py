#!/usr/bin/env python3
"""Surgical patch for apps/quantmail/src/app/calendar/page.tsx

Adds: event editing (useUpdateEvent wiring, Edit buttons, edit-aware sheet),
?attendee= prefill from Contacts, and removes the fake QuantMeet link generator.
Fails loudly (exit 1) if any anchor string is missing so nothing half-applies.
"""
import io
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "apps/quantmail/src/app/calendar/page.tsx"
src = io.open(path, encoding="utf-8").read()

if "useUpdateEvent" in src:
    print("ALREADY_APPLIED")
    sys.exit(0)

fail = []


def rep(old, new, count=1):
    global src
    c = src.count(old)
    if c != count:
        fail.append((old[:70].replace("\n", "\\n"), c, count))
        return
    src = src.replace(old, new)


# 1) import useUpdateEvent
rep(
    "import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';",
    "import {\n  useCalendarEvents,\n  useCreateEvent,\n  useUpdateEvent,\n  useDeleteEvent,\n} from '../../hooks/useCalendar';",
)

# 2) editingEventId state
rep(
    """  const [activeSheetType, setActiveSheetType] = useState<EntryType | null>(null);
  const [isSaving, setIsSaving] = useState(false);""",
    """  const [activeSheetType, setActiveSheetType] = useState<EntryType | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);""",
)

# 3) updateEvent hook
rep(
    """  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();""",
    """  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();""",
)

# 4) toTimeInput helper
rep(
    """const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;""",
    """const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

const toTimeInput = (date: Date) =>
  `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;""",
)

# 5) reset editing id when opening a fresh sheet
rep(
    """      setIsFabOpen(false);
      setSheetDragY(0);
      setPeriodSubTab('track');
      setActiveSheetType(type);
    },
    [selectedDate, currentUserEmail],
  );""",
    """      setIsFabOpen(false);
      setSheetDragY(0);
      setPeriodSubTab('track');
      setEditingEventId(null);
      setActiveSheetType(type);
    },
    [selectedDate, currentUserEmail],
  );""",
)

# 6) openEditSheet + closeSheet + ?attendee= prefill effect
rep(
    """  useEffect(() => {
    const handler = () => openDedicatedSheet('event');
    window.addEventListener('quant:calendar:create', handler);
    return () => window.removeEventListener('quant:calendar:create', handler);
  }, [openDedicatedSheet]);""",
    """  useEffect(() => {
    const handler = () => openDedicatedSheet('event');
    window.addEventListener('quant:calendar:create', handler);
    return () => window.removeEventListener('quant:calendar:create', handler);
  }, [openDedicatedSheet]);

  const openEditSheet = useCallback((ev: CalendarEventLike) => {
    const type: EntryType =
      ev.type === 'task' || ev.type === 'birthday' || ev.type === 'period'
        ? (ev.type as EntryType)
        : 'event';
    const startD = startOf(ev);
    const endD = endOf(ev);
    const hasStart = !Number.isNaN(startD.getTime());
    const hasEnd = !Number.isNaN(endD.getTime());
    const attendeeList = Array.isArray(ev.attendees)
      ? (ev.attendees as unknown[])
          .map((a) => (typeof a === 'string' ? a : ((a as { email?: string })?.email ?? '')))
          .filter(Boolean)
      : [];

    setFormState((prev) => ({
      ...prev,
      title: ev.title || '',
      startDate: hasStart ? toDateInput(startD) : prev.startDate,
      endDate: hasEnd ? toDateInput(endD) : hasStart ? toDateInput(startD) : prev.endDate,
      startTime: hasStart && !ev.allDay ? toTimeInput(startD) : prev.startTime,
      endTime: hasEnd && !ev.allDay ? toTimeInput(endD) : prev.endTime,
      allDay: Boolean(ev.allDay),
      location: ev.location || '',
      description: ev.description || '',
      recurrence: ev.recurrence || 'Does not repeat',
      color: ev.color || prev.color,
      attendeeInput: '',
      attendees: attendeeList,
      priority: ev.priority || 'medium',
      subtaskInput: '',
      subtasks: ev.subtasks || [],
      flowIntensity: ev.flowIntensity || 'medium',
      spottingColor: ev.spottingColor || 'red',
      currentCycleDay: ev.cycleDay || prev.currentCycleDay,
    }));

    setSelectedEvent(null);
    setIsFabOpen(false);
    setSheetDragY(0);
    setPeriodSubTab('track');
    setEditingEventId(ev.id);
    setActiveSheetType(type);
  }, []);

  const closeSheet = useCallback(() => {
    if (isSaving) return;
    setActiveSheetType(null);
    setEditingEventId(null);
  }, [isSaving]);

  // Prefill a new event when arriving from Contacts via /calendar?attendee=<email>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const attendee = params.get('attendee');
    if (!attendee) return;
    openDedicatedSheet('event');
    setFormState((prev) => ({
      ...prev,
      title: prev.title || `Meeting with ${attendee}`,
      attendees: prev.attendees.includes(attendee) ? prev.attendees : [...prev.attendees, attendee],
    }));
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);""",
)

# 7) save: update vs create + reset id
rep(
    """    setIsSaving(true);
    try {
      await createEvent.mutateAsync(payload as never);
      setTimeout(() => {
        setIsSaving(false);
        setActiveSheetType(null);
        showToast({""",
    """    setIsSaving(true);
    try {
      if (editingEventId) {
        await updateEvent.mutateAsync({ id: editingEventId, data: payload as never });
      } else {
        await createEvent.mutateAsync(payload as never);
      }
      setTimeout(() => {
        setIsSaving(false);
        setActiveSheetType(null);
        setEditingEventId(null);
        showToast({""",
)

# 7b) toast text saved/updated
rep(
    """          text: `${activeSheetType === 'task' ? 'Task' : activeSheetType === 'birthday' ? 'Birthday' : activeSheetType === 'period' ? 'Cycle entry' : 'Event'} \"${finalTitle}\" saved`,""",
    """          text: `${activeSheetType === 'task' ? 'Task' : activeSheetType === 'birthday' ? 'Birthday' : activeSheetType === 'period' ? 'Cycle entry' : 'Event'} \"${finalTitle}\" ${editingEventId ? 'updated' : 'saved'}`,""",
)

# 7c) error toast + deps
rep(
    """    } catch {
      setIsSaving(false);
      showToast({ text: 'Failed to save entry', type: 'error' });
    }
  }, [activeSheetType, formState, createEvent, refetch]);""",
    """    } catch {
      setIsSaving(false);
      showToast({
        text: editingEventId ? 'Failed to update entry' : 'Failed to save entry',
        type: 'error',
      });
    }
  }, [activeSheetType, formState, createEvent, updateEvent, editingEventId, refetch]);""",
)

# 8) remove fake meet-link generator function (regex: content-safe)
new_src, n = re.subn(
    r"  const handleAddMeetLink = \(\) => \{\n(?:.*\n)*?  \};\n\n",
    "",
    src,
    count=1,
)
if n != 1:
    fail.append(("handleAddMeetLink function", n, 1))
else:
    src = new_src

# 9) remove fake meet-link button row in event form
rep(
    """                      <div className=\"flex items-center justify-between py-2 border-b border-zinc-800/60\">
                        <div className=\"flex items-center gap-2.5 text-zinc-300\">
                          <IconVideo className=\"size-4 text-[#ff9933]\" />
                          <button
                            type=\"button\"
                            onClick={handleAddMeetLink}
                            className=\"text-xs text-[#ff9933] hover:underline font-bold\"
                          >
                            + Add QuantMeet / QuantChat video conferencing
                          </button>
                        </div>
                      </div>

""",
    "",
)

# 10) close buttons also clear editing id (backdrop + header X)
rep(
    "onClick={() => !isSaving && setActiveSheetType(null)}",
    "onClick={closeSheet}",
    count=2,
)

# 11) drag-to-dismiss clears editing id
rep(
    """    if (deltaY > 120 || velocityY > 0.4) {
      setActiveSheetType(null);
      return;
    }""",
    """    if (deltaY > 120 || velocityY > 0.4) {
      setActiveSheetType(null);
      setEditingEventId(null);
      return;
    }""",
)

# 12) sheet header titles: New vs Edit
rep(
    """                            <IconCalendar className=\"size-4 text-[#FF8C42]\" /> New Event""",
    """                            <IconCalendar className=\"size-4 text-[#FF8C42]\" />{' '}
                            {editingEventId ? 'Edit Event' : 'New Event'}""",
)
rep(
    """                            <IconTarget className=\"size-4 text-amber-400\" /> New Task""",
    """                            <IconTarget className=\"size-4 text-amber-400\" />{' '}
                            {editingEventId ? 'Edit Task' : 'New Task'}""",
)
rep(
    """                            <IconCake className=\"size-4 text-emerald-400\" /> New Birthday""",
    """                            <IconCake className=\"size-4 text-emerald-400\" />{' '}
                            {editingEventId ? 'Edit Birthday' : 'New Birthday'}""",
)

# 13) save button labels
rep(
    "                          <span>Saving\u2026</span>",
    "                          <span>{editingEventId ? 'Updating\u2026' : 'Saving\u2026'}</span>",
)
rep(
    "                        <span>Save</span>",
    "                        <span>{editingEventId ? 'Update' : 'Save'}</span>",
)

# 14) detail modal footer: add Edit Entry button
rep(
    """              <div className=\"flex items-center justify-between pt-3 border-t border-zinc-800\">
                <button
                  type=\"button\"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className=\"px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-bold\"
                >
                  Delete Entry
                </button>
                <Button variant=\"ghost\" onClick={() => setSelectedEvent(null)}>
                  Close
                </Button>
              </div>""",
    """              <div className=\"flex items-center justify-between pt-3 border-t border-zinc-800\">
                <div className=\"flex items-center gap-2\">
                  <button
                    type=\"button\"
                    onClick={() => openEditSheet(selectedEvent)}
                    className=\"px-3 py-1.5 rounded-xl bg-[#ff9933]/20 text-[#ff9933] hover:bg-[#ff9933]/30 text-xs font-bold\"
                  >
                    Edit Entry
                  </button>
                  <button
                    type=\"button\"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className=\"px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-bold\"
                  >
                    Delete Entry
                  </button>
                </div>
                <Button variant=\"ghost\" onClick={() => setSelectedEvent(null)}>
                  Close
                </Button>
              </div>""",
)

if fail:
    for f in fail:
        print("PATCH_FAIL anchor=%r found=%d expected=%d" % f)
    sys.exit(1)

io.open(path, "w", encoding="utf-8", newline="").write(src)
print("PATCH_OK")
