'use client';

import React, { useState } from 'react';
import { showToast } from '../../../components/InboxToast';

export interface CalendarRemindersViewProps {
  className?: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  dueTime: string;
  priority: 'urgent' | 'medium' | 'low';
  completed: boolean;
}

function CheckSquareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SquareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function CalendarRemindersView({ className = '' }: CalendarRemindersViewProps) {
  const [reminders, setReminders] = useState<ReminderItem[]>([
    {
      id: 'rem-1',
      title: 'Review PR #298 for Wave 39 Sovereign Parity',
      dueTime: 'Today, 5:00 PM',
      priority: 'urgent',
      completed: false,
    },
    {
      id: 'rem-2',
      title: 'Verify CalDAV RFC 5545 sync with external clients',
      dueTime: 'Tomorrow, 10:00 AM',
      priority: 'medium',
      completed: false,
    },
    {
      id: 'rem-3',
      title: 'Prepare QuantMeet 4K screen sharing demo',
      dueTime: 'Friday, 2:30 PM',
      priority: 'medium',
      completed: false,
    },
    {
      id: 'rem-4',
      title: 'Update QuantCalendar booking slug availability',
      dueTime: 'Next Monday, 9:00 AM',
      priority: 'low',
      completed: true,
    },
  ]);

  const [newTitle, setNewTitle] = useState('');
  const [newDueTime, setNewDueTime] = useState('Today, 6:00 PM');
  const [newPriority, setNewPriority] = useState<'urgent' | 'medium' | 'low'>('medium');
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'completed'>('all');

  const pendingCount = reminders.filter((r) => !r.completed).length;
  const completedCount = reminders.filter((r) => r.completed).length;

  const toggleReminder = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const next = !r.completed;
          showToast({
            text: next ? `Completed: "${r.title}"` : `Marked pending: "${r.title}"`,
            type: 'info',
          });
          return { ...r, completed: next };
        }
        return r;
      }),
    );
  };

  const handleAddReminder = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTitle.trim()) return;

    const item: ReminderItem = {
      id: `rem-${Date.now()}`,
      title: newTitle.trim(),
      dueTime: newDueTime || 'Today, 6:00 PM',
      priority: newPriority,
      completed: false,
    };

    setReminders((prev) => [item, ...prev]);
    setNewTitle('');
    showToast({ text: `Reminder added: "${item.title}"`, type: 'success' });
  };

  const handleDeleteReminder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReminders((prev) => prev.filter((r) => r.id !== id));
    showToast({ text: 'Reminder removed', type: 'info' });
  };

  const filteredReminders = reminders.filter((r) => {
    if (filterMode === 'pending') return !r.completed;
    if (filterMode === 'completed') return r.completed;
    return true;
  });

  return (
    <div
      id="subview-reminders"
      role="tabpanel"
      aria-labelledby="tab-reminders"
      className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Top Card: Stats & Quick Add */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                Task Reminders
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                Action Items
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5] mt-1">
              Time-Bound Tasks & Reminders
            </h2>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              Sync tasks with calendar deadlines and push alerts.
            </p>
          </div>

          {/* Counts Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#090A0E] border border-[#232938] text-xs font-mono text-[#F59E0B] shadow-inner">
            <span className="font-semibold text-white">{pendingCount}</span> pending
            <span className="text-[#232938]">·</span>
            <span className="font-semibold text-emerald-400">{completedCount}</span> completed
          </div>
        </div>

        {/* Quick Add Form */}
        <form onSubmit={handleAddReminder} className="pt-2 flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a new reminder…"
            className="flex-1 bg-[#090A0E] border border-[#232938] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#A1A4AC]/60 focus:outline-none focus:border-[#F59E0B] transition-colors"
          />

          <input
            type="text"
            value={newDueTime}
            onChange={(e) => setNewDueTime(e.target.value)}
            placeholder="Due time (e.g. Today, 5:00 PM)"
            className="w-full sm:w-44 bg-[#090A0E] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B]"
          />

          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as any)}
            className="bg-[#090A0E] border border-[#232938] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#F59E0B] cursor-pointer"
          >
            <option value="urgent" className="bg-[#12151E]">
              Urgent
            </option>
            <option value="medium" className="bg-[#12151E]">
              Medium
            </option>
            <option value="low" className="bg-[#12151E]">
              Low
            </option>
          </select>

          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-50 text-black text-xs font-bold transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
          >
            <PlusIcon className="size-3.5 text-black" />
            <span>Add Reminder</span>
          </button>
        </form>
      </div>

      {/* Reminders Checklist Section */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#232938] pb-3">
          <div className="flex items-center gap-2">
            {(['all', 'pending', 'completed'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all focus-visible:outline-none ${
                  filterMode === mode
                    ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 font-semibold'
                    : 'text-[#A1A4AC] hover:text-[#F5F5F5] border border-transparent'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <span className="text-xs text-[#A1A4AC] font-mono">
            {filteredReminders.length} item{filteredReminders.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Checklist */}
        <div className="space-y-2.5">
          {filteredReminders.length > 0 ? (
            filteredReminders.map((reminder) => {
              const priorityClass =
                reminder.priority === 'urgent'
                  ? 'bg-rose-950/60 border-rose-800/80 text-rose-300'
                  : reminder.priority === 'medium'
                  ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                  : 'bg-sky-950/60 border-sky-800/80 text-sky-300';

              return (
                <div
                  key={reminder.id}
                  onClick={() => toggleReminder(reminder.id)}
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none group focus-visible:outline-none ${
                    reminder.completed
                      ? 'bg-[#090A0E]/60 border-[#232938]/60 opacity-60'
                      : 'bg-[#090A0E] border-[#232938] hover:border-[#F59E0B]/40 hover:bg-[#161822]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Toggleable Checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={reminder.completed}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReminder(reminder.id);
                      }}
                      className="text-[#F59E0B] hover:scale-110 transition-transform focus-visible:outline-none"
                    >
                      {reminder.completed ? (
                        <CheckSquareIcon className="size-5 text-[#F59E0B]" />
                      ) : (
                        <SquareIcon className="size-5 text-[#A1A4AC] group-hover:text-[#F59E0B]" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate transition-all ${
                          reminder.completed
                            ? 'line-through text-[#A1A4AC]'
                            : 'text-[#F5F5F5] group-hover:text-[#F59E0B]'
                        }`}
                      >
                        {reminder.title}
                      </p>

                      <p className="text-xs text-[#A1A4AC] flex items-center gap-1.5 mt-0.5">
                        <ClockIcon className="size-3 text-[#F59E0B]" />
                        <span>Due: {reminder.dueTime}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Priority Pill */}
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${priorityClass}`}
                    >
                      {reminder.priority}
                    </span>

                    <button
                      type="button"
                      aria-label="Delete reminder"
                      onClick={(e) => handleDeleteReminder(reminder.id, e)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-lg text-[#A1A4AC] hover:text-rose-400 hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-all focus-visible:opacity-100 focus-visible:outline-none"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center rounded-xl bg-[#090A0E]/50 border border-dashed border-[#232938]">
              <p className="text-xs text-[#A1A4AC]">No reminders in this filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
