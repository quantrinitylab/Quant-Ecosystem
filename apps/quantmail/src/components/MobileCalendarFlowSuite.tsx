'use client';

/**
 * MobileCalendarFlowSuite — Mobile-first (390×844 iOS Viewport) Calendar Suite
 * Reverse-engineered 1:1 from Reference Mobile UX Flows:
 *  - Flow #15: Main Calendar (Month View, Event Chips, Date Pill, Bottom Nav)
 *  - Flow #95: Switching Calendar Views (Agenda / Day / 3-Day / Month Dropdown Menu)
 *  - Flow #18: Choosing a Different Date (Multi-week Drawer & Mini-Month Strip)
 *  - Flow #26: Creating an Event Sheet (Title, People, All Day, Split Date/Time, Quanty Meet, Details)
 *  - Flow #77: Scheduling Event Date & Time Picker (Start/End Tabs + 4-Column Drum Wheel Picker)
 *  - Flow #80: Scheduling Repeating Events (Repeat Frequency + Repeat Until Calendar Sheet)
 *  - Flow #43: Event Detail View (Map Snippet, Location, Meet Join, Organizer, RSVP)
 *  - Flow #36: Editing an Event Sheet (Prepopulated Form + Cancel Event Action)
 *  - Flow #16: Canceling an Event Dialog (Calendar-X Modal, Note Input, Send Cancellation)
 *  - Flow #42: Event Description Screen (Standup Report PDF Badge, Body Text, Meeting Credentials)
 *  - Flow #91: Sharing a Calendar Flow (Left Calendar Drawer + Add People Autocomplete Sheet)
 *  - Flow #104: Uploading a File / Event Attachment (Action Sheet + File Source Picker)
 *
 * Strict Zero-Competitor Naming (QuantMail, Quanty Meet, QuantDrive).
 * Dual-Theme Verification: White (Light) & Black (Dark) 1:1.
 */

import React, { useState, useMemo } from 'react';
import { MobileInviteGuestsSheet } from './MobileBatch8Suite';

// ============================================================================
// Types & Models
// ============================================================================

export type MobileCalendarViewMode = 'month' | 'agenda' | 'day' | 'three_day';

export type MobileCalendarSubScreen =
  | 'main'
  | 'new_event'
  | 'edit_event'
  | 'time_picker'
  | 'repeat_picker'
  | 'repeat_until_picker'
  | 'event_detail'
  | 'cancel_event_dialog'
  | 'event_description'
  | 'calendar_drawer'
  | 'share_calendar_add_people'
  | 'attachment_action_sheet'
  | 'attach_file_picker';

export interface MobileCalendarEvent {
  id: string;
  title: string;
  dateKey: string; // e.g. "2026-02-26"
  dayNumber: number; // 26
  startTime: string; // "10:00 AM"
  endTime: string; // "10:30 AM"
  duration: string; // "30 minutes"
  colorTheme: 'teal' | 'coral' | 'purple' | 'yellow' | 'blue' | 'cyan' | 'salmon' | 'mint' | 'orange';
  location?: string;
  isOnlineMeeting?: boolean;
  meetingId?: string;
  passcode?: string;
  organizer: {
    name: string;
    email: string;
    avatarUrl?: string;
    initials: string;
  };
  attendees: Array<{
    name: string;
    email: string;
    isOptional?: boolean;
    status: 'accepted' | 'tentative' | 'declined' | 'pending';
  }>;
  recurrence?: string;
  descriptionSnippet?: string;
  fullDescription?: string;
  attachments?: Array<{
    name: string;
    size: string;
    type: 'pdf' | 'doc' | 'image';
  }>;
  allDay?: boolean;
  remindMe?: string;
  showAs?: string;
  isPrivate?: boolean;
}

// Initial Events reflecting the reference screens 1:1
export const INITIAL_MOBILE_CALENDAR_EVENTS: MobileCalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Daily standup',
    dateKey: '2026-02-26',
    dayNumber: 26,
    startTime: '10:00 AM',
    endTime: '10:30 AM',
    duration: '30 minutes',
    colorTheme: 'teal',
    location: '1226 University Dr',
    isOnlineMeeting: true,
    meetingId: '934 897 545 405 7',
    passcode: '43sk7s',
    organizer: {
      name: 'Ms Alex Smith',
      email: 'alexsmith@quantrinity.in',
      initials: 'AS',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80',
    },
    attendees: [
      { name: 'Ms Alex Smith', email: 'alexsmith@quantrinity.in', status: 'accepted' },
      { name: 'Sam Lee', email: 'samlee@quantrinity.in', isOptional: true, status: 'accepted' },
    ],
    recurrence: 'Repeats daily until 25 Aug 2026',
    descriptionSnippet: 'Daily team syncs for updates and blockers....',
    fullDescription: 'Daily team sync for updates and blockers.',
    attachments: [
      { name: 'Standup report', size: 'PDF - 5 KB', type: 'pdf' },
    ],
    allDay: false,
    remindMe: '15 minutes before',
    showAs: 'Busy',
    isPrivate: false,
  },
  {
    id: 'evt-2',
    title: 'Project Fortuna: Kick-off Meeting',
    dateKey: '2026-02-27',
    dayNumber: 27,
    startTime: '11:00 AM',
    endTime: '12:00 PM',
    duration: '1 hour',
    colorTheme: 'purple',
    location: 'Conference Room 4B',
    isOnlineMeeting: true,
    meetingId: '812 409 332 101 2',
    passcode: 'fortuna8',
    organizer: {
      name: 'Sam Lee',
      email: 'samlee@quantrinity.in',
      initials: 'SL',
    },
    attendees: [
      { name: 'Alex Smith', email: 'alexsmith@quantrinity.in', status: 'accepted' },
    ],
    recurrence: 'None',
    descriptionSnippet: 'Project Fortuna scope, timeline, milestones...',
    fullDescription: 'Project Fortuna kick-off meeting to align all stakeholders.',
    allDay: false,
    remindMe: '15 minutes before',
    showAs: 'Busy',
  },
  {
    id: 'evt-3',
    title: 'Lunch',
    dateKey: '2026-02-26',
    dayNumber: 26,
    startTime: '12:00 PM',
    endTime: '1:00 PM',
    duration: '1 hour',
    colorTheme: 'coral',
    location: 'Cafeteria / Terrace',
    organizer: {
      name: 'Sam Lee',
      email: 'samlee@quantrinity.in',
      initials: 'SL',
    },
    attendees: [],
    recurrence: 'None',
    descriptionSnippet: 'Lunch break',
    allDay: false,
    remindMe: 'None',
    showAs: 'Free',
  },
  {
    id: 'evt-4',
    title: 'Project Fortuna: PRD Discussion',
    dateKey: '2026-02-26',
    dayNumber: 26,
    startTime: '2:00 PM',
    endTime: '2:30 PM',
    duration: '30 minutes',
    colorTheme: 'teal',
    location: 'Online Meeting',
    isOnlineMeeting: true,
    organizer: {
      name: 'Sam Lee',
      email: 'samlee@quantrinity.in',
      initials: 'SL',
    },
    attendees: [],
    recurrence: 'None',
    descriptionSnippet: 'PRD review and spec signoff',
    allDay: false,
    remindMe: '10 minutes before',
    showAs: 'Busy',
  },
  {
    id: 'evt-5',
    title: 'Focus time',
    dateKey: '2026-02-26',
    dayNumber: 26,
    startTime: '2:30 PM',
    endTime: '3:30 PM',
    duration: '1 hour',
    colorTheme: 'salmon',
    organizer: {
      name: 'Sam Lee',
      email: 'samlee@quantrinity.in',
      initials: 'SL',
    },
    attendees: [],
    recurrence: 'None',
    descriptionSnippet: 'Deep work & coding',
    allDay: false,
    remindMe: 'None',
    showAs: 'Busy',
  },
  {
    id: 'evt-6',
    title: 'Pack merchandise',
    dateKey: '2026-02-27',
    dayNumber: 27,
    startTime: '1:00 PM',
    endTime: '2:00 PM',
    duration: '1 hour',
    colorTheme: 'cyan',
    organizer: {
      name: 'Sam Lee',
      email: 'samlee@quantrinity.in',
      initials: 'SL',
    },
    attendees: [],
    recurrence: 'None',
    allDay: false,
    remindMe: 'None',
    showAs: 'Busy',
  },
];

// Color styling mappings for event chips & timeline blocks
const EVENT_COLOR_STYLES: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  teal: {
    bg: 'bg-[#B2EBF2] dark:bg-[#004D40]',
    text: 'text-[#006064] dark:text-[#E0F7FA]',
    border: 'border-[#80DEEA] dark:border-[#00695C]',
    accent: '#00838F',
  },
  coral: {
    bg: 'bg-[#FFCDD2] dark:bg-[#4A1418]',
    text: 'text-[#B71C1C] dark:text-[#FFEBEE]',
    border: 'border-[#EF9A9A] dark:border-[#880E4F]',
    accent: '#D32F2F',
  },
  purple: {
    bg: 'bg-[#E1BEE7] dark:bg-[#311B92]',
    text: 'text-[#4A148C] dark:text-[#EDE7F6]',
    border: 'border-[#CE93D8] dark:border-[#4527A0]',
    accent: '#7B1FA2',
  },
  yellow: {
    bg: 'bg-[#FFF9C4] dark:bg-[#4E342E]',
    text: 'text-[#F57F17] dark:text-[#FFFDE7]',
    border: 'border-[#FFF59D] dark:border-[#6D4C41]',
    accent: '#FBC02D',
  },
  cyan: {
    bg: 'bg-[#B2EBF2] dark:bg-[#006064]',
    text: 'text-[#006064] dark:text-[#E0F7FA]',
    border: 'border-[#4DD0E1] dark:border-[#00838F]',
    accent: '#00ACC1',
  },
  salmon: {
    bg: 'bg-[#FFCCBC] dark:bg-[#3E2723]',
    text: 'text-[#BF360C] dark:text-[#FBE9E7]',
    border: 'border-[#FFAB91] dark:border-[#4E342E]',
    accent: '#E64A19',
  },
  blue: {
    bg: 'bg-[#BBDEFB] dark:bg-[#0D47A1]',
    text: 'text-[#0D47A1] dark:text-[#E3F2FD]',
    border: 'border-[#90CAF9] dark:border-[#1565C0]',
    accent: '#1976D2',
  },
  mint: {
    bg: 'bg-[#C8E6C9] dark:bg-[#1B5E20]',
    text: 'text-[#1B5E20] dark:text-[#E8F5E9]',
    border: 'border-[#A5D6A7] dark:border-[#2E7D32]',
    accent: '#388E3C',
  },
  orange: {
    bg: 'bg-[#FFE0B2] dark:bg-[#4E342E]',
    text: 'text-[#E65100] dark:text-[#FFF3E0]',
    border: 'border-[#FFCC80] dark:border-[#5D4037]',
    accent: '#F57C00',
  },
};

// ============================================================================
// SVG Vector Icon Components (High-Precision Stroke, Zero Raw Unicode Emojis)
// ============================================================================

export function SvgCalendarCheck({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

export function SvgCalendarPlus({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-6'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}

export function SvgCalendarCancel({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-6'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="10" y1="14" x2="14" y2="18" />
      <line x1="14" y1="14" x2="10" y2="18" />
    </svg>
  );
}

export function SvgViewAgenda({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function SvgViewDay({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
    </svg>
  );
}

export function SvgViewThreeDay({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );
}

export function SvgViewMonth({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="10" y="3" width="5" height="5" rx="1" />
      <rect x="17" y="3" width="5" height="5" rx="1" />
      <rect x="3" y="10" width="5" height="5" rx="1" />
      <rect x="10" y="10" width="5" height="5" rx="1" />
      <rect x="17" y="10" width="5" height="5" rx="1" />
      <rect x="3" y="17" width="5" height="5" rx="1" />
      <rect x="10" y="17" width="5" height="5" rx="1" />
      <rect x="17" y="17" width="5" height="5" rx="1" />
    </svg>
  );
}

export function SvgRepeat({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function SvgVideoMeeting({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export function SvgMapPin({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function SvgClock({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function SvgPaperclip({ className }: { className?: string }) {
  return (
    <svg className={className || 'size-5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// ============================================================================
// Main Component: MobileCalendarFlowSuite
// ============================================================================

export interface MobileCalendarFlowSuiteProps {
  onBackToEmail?: () => void;
}

export function MobileCalendarFlowSuite({ onBackToEmail }: MobileCalendarFlowSuiteProps) {
  // Navigation & Sub-Screen State
  const [subScreen, setSubScreen] = useState<MobileCalendarSubScreen>('main');
  const [showInviteGuestsSheet, setShowInviteGuestsSheet] = useState(false);
  const [showOpenWithSheet, setShowOpenWithSheet] = useState(false);
  const [viewMode, setViewMode] = useState<MobileCalendarViewMode>('month');
  const [showViewSwitcher, setShowViewSwitcher] = useState(false);
  const [isMonthPickerExpanded, setIsMonthPickerExpanded] = useState(false);

  // Selected Date State
  const [selectedDay, setSelectedDay] = useState<number>(26);
  const [activeDateKey, setActiveDateKey] = useState<string>('2026-02-26');

  // Events Model
  const [events, setEvents] = useState<MobileCalendarEvent[]>(INITIAL_MOBILE_CALENDAR_EVENTS);
  const [activeEvent, setActiveEvent] = useState<MobileCalendarEvent | null>(INITIAL_MOBILE_CALENDAR_EVENTS[0]);

  // Form State for New / Edit Event (Flows #26 & #36)
  const [formTitle, setFormTitle] = useState('Daily standup');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formDate, setFormDate] = useState('Thu, 26 Feb');
  const [formStartTime, setFormStartTime] = useState('10:00 AM');
  const [formEndTime, setFormEndTime] = useState('10:30 AM');
  const [formDuration, setFormDuration] = useState('30 minutes');
  const [formTimeZone, setFormTimeZone] = useState('Pacific Standard Time (GMT-8)');
  const [formRepeat, setFormRepeat] = useState<'None' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'>('Daily');
  const [formRepeatInterval, setFormRepeatInterval] = useState('1 day');
  const [formRepeatUntil, setFormRepeatUntil] = useState('Wed, 26 Aug');
  const [formLocation, setFormLocation] = useState('1226 University Dr');
  const [formQuantyMeet, setFormQuantyMeet] = useState(true);
  const [formDescription, setFormDescription] = useState('Daily team sync for updates and blockers.');
  const [formAttachments, setFormAttachments] = useState<Array<{ name: string; size: string; type: 'pdf' | 'doc' | 'image' }>>([
    { name: 'Standup report', size: 'PDF - 5 KB', type: 'pdf' },
  ]);
  const [formRemindMe, setFormRemindMe] = useState('15 minutes before');
  const [formShowAs, setFormShowAs] = useState('Busy');
  const [formPrivate, setFormPrivate] = useState(false);

  // Time Picker Tab (Flow #77)
  const [timePickerTab, setTimePickerTab] = useState<'start' | 'end'>('start');
  const [pickerDay, setPickerDay] = useState('Today');
  const [pickerHour, setPickerHour] = useState('10');
  const [pickerMinute, setPickerMinute] = useState('00');
  const [pickerAmPm, setPickerAmPm] = useState<'AM' | 'PM'>('AM');

  // Cancellation Note (Flow #16)
  const [cancelNote, setCancelNote] = useState("I need to cancel our meeting due to a doctor's appointment.");

  // Share Calendar People Search (Flow #91)
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [sharedPeople, setSharedPeople] = useState<Array<{ name: string; email: string }>>([]);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Days in February 2026 Grid (Starts on Sunday Feb 1)
  // Feb 2026: 28 days, Sunday Feb 1 to Saturday Feb 28
  const februaryDays = useMemo(() => {
    const list: Array<{ day: number; isCurrentMonth: boolean }> = [];
    for (let i = 1; i <= 28; i++) {
      list.push({ day: i, isCurrentMonth: true });
    }
    // Pad to 35 for 5 full weeks
    for (let i = 1; i <= 7; i++) {
      list.push({ day: i, isCurrentMonth: false });
    }
    return list;
  }, []);

  // Events filtered for current selected day
  const currentDayEvents = useMemo(() => {
    return events.filter(e => e.dayNumber === selectedDay);
  }, [events, selectedDay]);

  // Handle Event Cancellation (Flow #16)
  const handleConfirmCancelEvent = () => {
    if (activeEvent) {
      setEvents(prev => prev.filter(e => e.id !== activeEvent.id));
      triggerToast('Event canceled and removed from calendar');
      setSubScreen('main');
    }
  };

  // Handle Save New/Edited Event (Flow #26 & #36)
  const handleSaveEvent = () => {
    if (!formTitle.trim()) return;

    if (subScreen === 'edit_event' && activeEvent) {
      setEvents(prev =>
        prev.map(e =>
          e.id === activeEvent.id
            ? {
                ...e,
                title: formTitle,
                allDay: formAllDay,
                startTime: formStartTime,
                endTime: formEndTime,
                duration: formDuration,
                location: formLocation,
                isOnlineMeeting: formQuantyMeet,
                fullDescription: formDescription,
                recurrence: formRepeat !== 'None' ? `Repeats ${formRepeat.toLowerCase()} until ${formRepeatUntil} 2026` : 'None',
              }
            : e
        )
      );
      triggerToast('Event updated');
    } else {
      const newEvt: MobileCalendarEvent = {
        id: `evt-${Date.now()}`,
        title: formTitle,
        dateKey: activeDateKey,
        dayNumber: selectedDay,
        startTime: formStartTime,
        endTime: formEndTime,
        duration: formDuration,
        colorTheme: 'teal',
        location: formLocation,
        isOnlineMeeting: formQuantyMeet,
        meetingId: '934 897 545 405 7',
        passcode: '43sk7s',
        organizer: {
          name: 'Sam Lee',
          email: 'samlee@quantrinity.in',
          initials: 'SL',
        },
        attendees: [
          { name: 'Sam Lee', email: 'samlee@quantrinity.in', status: 'accepted' },
        ],
        recurrence: formRepeat !== 'None' ? `Repeats ${formRepeat.toLowerCase()} until ${formRepeatUntil} 2026` : 'None',
        descriptionSnippet: formDescription.slice(0, 40) + '...',
        fullDescription: formDescription,
        attachments: formAttachments,
        allDay: formAllDay,
        remindMe: formRemindMe,
        showAs: formShowAs,
        isPrivate: formPrivate,
      };
      setEvents(prev => [newEvt, ...prev]);
      triggerToast('Event created');
    }
    setSubScreen('main');
  };

  return (
    <div
      data-testid="mobile-calendar-suite"
      className="relative mx-auto flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[44px] border-[8px] border-[#1C1C1E] bg-[var(--quant-background)] font-sans text-[var(--quant-foreground)] shadow-2xl transition-colors"
    >
      {/* iOS Top Status Bar (9:41, Cellular, WiFi, Battery) */}
      <div className="z-30 flex h-11 w-full flex-none items-center justify-between px-6 pt-1 text-xs font-semibold text-[var(--quant-foreground)]">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.23 19.64 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9z" />
          </svg>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z" />
          </svg>
          <div className="h-2.5 w-5 rounded-sm border border-current p-0.5">
            <div className="h-full w-3/4 rounded-2xs bg-current" />
          </div>
        </div>
      </div>

      {/* Floating Feedback Toast */}
      {toastMessage && (
        <div
          data-testid="calendar-toast"
          className="fixed inset-x-6 top-14 z-50 flex items-center justify-between rounded-xl bg-[#0078D4] px-4 py-3 text-xs font-semibold text-white shadow-xl animate-fade-in"
        >
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="ml-2 text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 1. MAIN CALENDAR SCREEN (Flows #15, #95, #18)                           */}
      {/* ====================================================================== */}
      {subScreen === 'main' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top Blue Header Banner */}
          <div className="relative flex flex-none items-center justify-between bg-[#0078D4] px-4 py-2.5 text-white shadow-md">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="open-calendar-drawer-btn"
                aria-label="Open accounts and calendars"
                onClick={() => setSubScreen('calendar_drawer')}
                className="flex size-8 items-center justify-center rounded-full bg-[#EC4899] text-xs font-bold text-white shadow"
              >
                SL
              </button>
              <h1 className="text-xl font-bold tracking-tight">February</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* View Switcher Dropdown Trigger (Flow #95) */}
              <button
                type="button"
                data-testid="view-switcher-btn"
                aria-label="Switch calendar view"
                onClick={() => setShowViewSwitcher(prev => !prev)}
                className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
              >
                {viewMode === 'month' && <SvgViewMonth className="size-5" />}
                {viewMode === 'agenda' && <SvgViewAgenda className="size-5" />}
                {viewMode === 'day' && <SvgViewDay className="size-5" />}
                {viewMode === 'three_day' && <SvgViewThreeDay className="size-5" />}
              </button>

              <button
                type="button"
                aria-label="Search events"
                className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>

            {/* Flow #95: Dropdown Menu for View Switcher */}
            {showViewSwitcher && (
              <div
                data-testid="view-switcher-dropdown"
                className="absolute right-4 top-14 z-50 w-44 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] py-1.5 shadow-2xl animate-fade-in"
              >
                <button
                  type="button"
                  data-testid="switch-view-agenda"
                  onClick={() => { setViewMode('agenda'); setShowViewSwitcher(false); }}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex items-center gap-2.5">
                    <SvgViewAgenda className="size-4 text-[var(--quant-muted-foreground)]" />
                    <span>Agenda</span>
                  </div>
                  {viewMode === 'agenda' && <span className="text-[#0078D4] font-bold">✓</span>}
                </button>
                <button
                  type="button"
                  data-testid="switch-view-day"
                  onClick={() => { setViewMode('day'); setShowViewSwitcher(false); }}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex items-center gap-2.5">
                    <SvgViewDay className="size-4 text-[var(--quant-muted-foreground)]" />
                    <span>Day</span>
                  </div>
                  {viewMode === 'day' && <span className="text-[#0078D4] font-bold">✓</span>}
                </button>
                <button
                  type="button"
                  data-testid="switch-view-3day"
                  onClick={() => { setViewMode('three_day'); setShowViewSwitcher(false); }}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex items-center gap-2.5">
                    <SvgViewThreeDay className="size-4 text-[var(--quant-muted-foreground)]" />
                    <span>3-Day</span>
                  </div>
                  {viewMode === 'three_day' && <span className="text-[#0078D4] font-bold">✓</span>}
                </button>
                <button
                  type="button"
                  data-testid="switch-view-month"
                  onClick={() => { setViewMode('month'); setShowViewSwitcher(false); }}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex items-center gap-2.5">
                    <SvgViewMonth className="size-4 text-[var(--quant-muted-foreground)]" />
                    <span>Month</span>
                  </div>
                  {viewMode === 'month' && <span className="text-[#0078D4] font-bold">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Subheader: S M T W T F S Day Headers */}
          <div className="grid grid-cols-7 border-b border-[var(--quant-border)] bg-[var(--quant-card)] py-1.5 text-center text-[11px] font-semibold text-[var(--quant-muted-foreground)]">
            <span>S</span>
            <span>M</span>
            <span>T</span>
            <span>W</span>
            <span>T</span>
            <span>F</span>
            <span>S</span>
          </div>

          {/* VIEW: MONTH (Flow #15 & #18) */}
          {viewMode === 'month' && (
            <div data-testid="calendar-month-grid" className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-7 border-collapse">
                {februaryDays.map((item, idx) => {
                  const dayEvents = events.filter(e => e.dayNumber === item.day && item.isCurrentMonth);
                  const isSelected = item.day === selectedDay && item.isCurrentMonth;
                  const isToday = item.day === 26 && item.isCurrentMonth;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (item.isCurrentMonth) {
                          setSelectedDay(item.day);
                          setActiveDateKey(`2026-02-${String(item.day).padStart(2, '0')}`);
                        }
                      }}
                      className={`relative min-h-[92px] border-b border-r border-[var(--quant-border)] p-1 text-left transition-colors ${
                        item.isCurrentMonth ? 'bg-[var(--quant-card)]' : 'bg-[var(--quant-background)]/50 opacity-40'
                      } ${isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-[var(--quant-surface-hover)]'}`}
                    >
                      <div className="flex items-center justify-start">
                        {isToday ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-[#0078D4] text-[11px] font-bold text-white shadow-sm">
                            {item.day}
                          </span>
                        ) : (
                          <span className={`text-[11px] font-medium ${isSelected ? 'font-bold text-[#0078D4]' : 'text-[var(--quant-foreground)]'}`}>
                            {item.day === 1 ? '1 Feb' : item.day}
                          </span>
                        )}
                      </div>

                      {/* Event Chips inside Date Box */}
                      <div className="mt-1 flex flex-col gap-0.5">
                        {dayEvents.slice(0, 3).map(evt => {
                          const style = EVENT_COLOR_STYLES[evt.colorTheme] || EVENT_COLOR_STYLES.teal;
                          return (
                            <div
                              key={evt.id}
                              data-testid={`event-chip-${evt.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveEvent(evt);
                                setSubScreen('event_detail');
                              }}
                              className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${style.bg} ${style.text} shadow-2xs hover:brightness-95`}
                            >
                              {evt.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-[8px] font-semibold text-[var(--quant-muted-foreground)]">
                            +{dayEvents.length - 3} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: AGENDA (Flow #95 Screen 2) */}
          {viewMode === 'agenda' && (
            <div data-testid="calendar-agenda-view" className="flex-1 overflow-y-auto">
              {/* Mini Month Strip with Drag Handle */}
              <div className="border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-2 pb-2 pt-1 shadow-xs">
                <div className="grid grid-cols-7 text-center text-xs">
                  {[22, 23, 24, 25, 26, 27, 28].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      className={`mx-auto flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                        d === selectedDay
                          ? 'bg-[#0078D4] text-white'
                          : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex justify-center">
                  <div className="h-1 w-9 rounded-full bg-[var(--quant-muted-foreground)]/30" />
                </div>
              </div>

              {/* Agenda Sections */}
              <div className="divide-y divide-[var(--quant-border)]">
                {/* Section: Today */}
                <div className="p-3">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold text-[var(--quant-foreground)]">
                      Today <span className="font-normal text-[var(--quant-muted-foreground)]">Thu, 26 Feb</span>
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">☁ 32° / 26°</span>
                  </div>

                  <div className="space-y-2">
                    {events
                      .filter(e => e.dayNumber === 26)
                      .map(evt => {
                        const style = EVENT_COLOR_STYLES[evt.colorTheme] || EVENT_COLOR_STYLES.teal;
                        return (
                          <div
                            key={evt.id}
                            onClick={() => { setActiveEvent(evt); setSubScreen('event_detail'); }}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-xs hover:border-[#0078D4]"
                          >
                            <div className="flex w-16 flex-col text-right">
                              <span className="text-xs font-semibold text-[var(--quant-foreground)]">{evt.startTime}</span>
                              <span className="text-[10px] text-[var(--quant-muted-foreground)]">{evt.duration}</span>
                            </div>
                            <div className="mt-1 size-2 flex-none rounded-full" style={{ backgroundColor: style.accent }} />
                            <div className="flex-1">
                              <h3 className="text-xs font-semibold text-[var(--quant-foreground)]">{evt.title}</h3>
                              {evt.location && (
                                <p className="flex items-center gap-1 text-[11px] text-[var(--quant-muted-foreground)]">
                                  <SvgMapPin className="size-3 flex-none" />
                                  <span className="truncate">{evt.location}</span>
                                </p>
                              )}
                              {evt.organizer && (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--quant-muted-foreground)]">
                                  <span>{evt.organizer.name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Section: Tomorrow */}
                <div className="p-3">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold text-[var(--quant-foreground)]">
                      Tomorrow <span className="font-normal text-[var(--quant-muted-foreground)]">Fri, 27 Feb</span>
                    </span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">☁ 31° / 26°</span>
                  </div>

                  <div className="space-y-2">
                    {events
                      .filter(e => e.dayNumber === 27)
                      .map(evt => {
                        const style = EVENT_COLOR_STYLES[evt.colorTheme] || EVENT_COLOR_STYLES.teal;
                        return (
                          <div
                            key={evt.id}
                            onClick={() => { setActiveEvent(evt); setSubScreen('event_detail'); }}
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-xs hover:border-[#0078D4]"
                          >
                            <div className="flex w-16 flex-col text-right">
                              <span className="text-xs font-semibold text-[var(--quant-foreground)]">{evt.startTime}</span>
                              <span className="text-[10px] text-[var(--quant-muted-foreground)]">{evt.duration}</span>
                            </div>
                            <div className="mt-1 size-2 flex-none rounded-full" style={{ backgroundColor: style.accent }} />
                            <div className="flex-1">
                              <h3 className="text-xs font-semibold text-[var(--quant-foreground)]">{evt.title}</h3>
                              {evt.location && (
                                <p className="flex items-center gap-1 text-[11px] text-[var(--quant-muted-foreground)]">
                                  <SvgMapPin className="size-3 flex-none" />
                                  <span className="truncate">{evt.location}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: DAY (Flow #95 Screen 3) */}
          {viewMode === 'day' && (
            <div data-testid="calendar-day-view" className="flex-1 overflow-y-auto">
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0078D4]">Thu 26</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">GMT+7</span>
                </div>
                <span className="text-xs text-[var(--quant-muted-foreground)]">☁ 26° / 32°</span>
              </div>

              {/* Day Timeline (10 AM to 5 PM) */}
              <div className="relative divide-y divide-[var(--quant-border)]/50 pb-8">
                {['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'].map((timeStr, idx) => (
                  <div key={idx} className="relative flex min-h-[58px] items-start px-3 py-1">
                    <span className="w-12 flex-none text-[10px] font-medium text-[var(--quant-muted-foreground)]">{timeStr}</span>
                    <div className="flex-1">
                      {/* Events placed at this hour */}
                      {idx === 0 && (
                        <div
                          onClick={() => { setActiveEvent(events[0]); setSubScreen('event_detail'); }}
                          className="rounded-lg border-l-4 border-l-[#00838F] bg-[#B2EBF2] dark:bg-[#004D40] p-2 text-xs font-semibold text-[#006064] dark:text-[#E0F7FA] shadow-xs cursor-pointer"
                        >
                          Daily standup · 1226 University Dr
                        </div>
                      )}
                      {idx === 2 && (
                        <div
                          onClick={() => { setActiveEvent(events[2]); setSubScreen('event_detail'); }}
                          className="rounded-lg border-l-4 border-l-[#D32F2F] bg-[#FFCDD2] dark:bg-[#4A1418] p-2 text-xs font-semibold text-[#B71C1C] dark:text-[#FFEBEE] shadow-xs cursor-pointer"
                        >
                          Lunch
                        </div>
                      )}
                      {idx === 4 && (
                        <div className="space-y-1">
                          <div
                            onClick={() => { setActiveEvent(events[3]); setSubScreen('event_detail'); }}
                            className="rounded-lg border-l-4 border-l-[#00ACC1] bg-[#B2EBF2] dark:bg-[#006064] p-2 text-xs font-semibold text-[#006064] dark:text-[#E0F7FA] shadow-xs cursor-pointer"
                          >
                            Project Fortuna: PRD Discussion · Online Meeting
                          </div>
                          {/* Real-time Indicator Line */}
                          <div className="relative flex items-center gap-1 py-1">
                            <span className="text-[9px] font-bold text-[#0078D4]">2:29 PM</span>
                            <div className="size-1.5 rounded-full bg-[#0078D4]" />
                            <div className="h-0.5 flex-1 bg-[#0078D4]" />
                          </div>
                          <div
                            onClick={() => { setActiveEvent(events[4]); setSubScreen('event_detail'); }}
                            className="rounded-lg border-l-4 border-l-[#E64A19] bg-[#FFCCBC] dark:bg-[#3E2723] p-2 text-xs font-semibold text-[#BF360C] dark:text-[#FBE9E7] shadow-xs cursor-pointer"
                          >
                            Focus time
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: 3-DAY (Flow #95 Screen 4) */}
          {viewMode === 'three_day' && (
            <div data-testid="calendar-3day-view" className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-4 border-b border-[var(--quant-border)] bg-[var(--quant-card)] text-center text-xs py-1.5 font-semibold">
                <span className="text-[10px] text-[var(--quant-muted-foreground)]">GMT+7</span>
                <span className="text-[#0078D4]">Thu 26</span>
                <span className="text-[var(--quant-foreground)]">Fri 27</span>
                <span className="text-[var(--quant-foreground)]">Sat 28</span>
              </div>

              <div className="grid grid-cols-4 divide-x divide-[var(--quant-border)] min-h-[400px]">
                {/* Column 1: Timeline Hours */}
                <div className="divide-y divide-[var(--quant-border)]/50 text-[10px] text-[var(--quant-muted-foreground)]">
                  {['10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'].map((h, i) => (
                    <div key={i} className="h-16 px-1 pt-1">{h}</div>
                  ))}
                </div>
                {/* Column 2: Thu 26 */}
                <div className="relative p-1">
                  <div
                    onClick={() => { setActiveEvent(events[0]); setSubScreen('event_detail'); }}
                    className="mb-1 rounded bg-[#B2EBF2] dark:bg-[#004D40] p-1 text-[9px] font-semibold text-[#006064] dark:text-[#E0F7FA] cursor-pointer"
                  >
                    Daily standup...
                  </div>
                  <div
                    onClick={() => { setActiveEvent(events[2]); setSubScreen('event_detail'); }}
                    className="mt-6 rounded bg-[#FFCDD2] dark:bg-[#4A1418] p-1 text-[9px] font-semibold text-[#B71C1C] dark:text-[#FFEBEE] cursor-pointer"
                  >
                    Lunch
                  </div>
                  <div
                    onClick={() => { setActiveEvent(events[3]); setSubScreen('event_detail'); }}
                    className="mt-4 rounded bg-[#B2EBF2] dark:bg-[#006064] p-1 text-[9px] font-semibold text-[#006064] dark:text-[#E0F7FA] cursor-pointer"
                  >
                    Project Fortu...
                  </div>
                </div>
                {/* Column 3: Fri 27 */}
                <div className="relative p-1">
                  <div
                    onClick={() => { setActiveEvent(events[0]); setSubScreen('event_detail'); }}
                    className="mb-1 rounded bg-[#B2EBF2] dark:bg-[#004D40] p-1 text-[9px] font-semibold text-[#006064] dark:text-[#E0F7FA] cursor-pointer"
                  >
                    Daily standup...
                  </div>
                  <div
                    onClick={() => { setActiveEvent(events[1]); setSubScreen('event_detail'); }}
                    className="mt-3 rounded bg-[#E1BEE7] dark:bg-[#311B92] p-1 text-[9px] font-semibold text-[#4A148C] dark:text-[#EDE7F6] cursor-pointer"
                  >
                    Project Fortuna: Kick-off Meeting
                  </div>
                  <div
                    onClick={() => { setActiveEvent(events[2]); setSubScreen('event_detail'); }}
                    className="mt-2 rounded bg-[#FFCDD2] dark:bg-[#4A1418] p-1 text-[9px] font-semibold text-[#B71C1C] dark:text-[#FFEBEE] cursor-pointer"
                  >
                    Lunch
                  </div>
                </div>
                {/* Column 4: Sat 28 */}
                <div className="relative p-1">
                  <span className="text-[10px] text-[var(--quant-muted-foreground)]">No events</span>
                </div>
              </div>
            </div>
          )}

          {/* Floating Action Button: Add Event (White Rounded Square with Blue Calendar +) */}
          <div className="absolute bottom-16 right-4 z-40">
            <button
              type="button"
              data-testid="create-event-fab"
              aria-label="Create new event"
              onClick={() => {
                setFormTitle('');
                setSubScreen('new_event');
              }}
              className="flex size-14 items-center justify-center rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] text-[#0078D4] shadow-2xl hover:scale-105 active:scale-95 transition-transform"
            >
              <SvgCalendarPlus className="size-7" />
            </button>
          </div>

          {/* Bottom 3-Tab Navigation Bar: Email | Calendar (Active 26) | Apps */}
          <nav
            aria-label="Mobile calendar primary navigation"
            className="flex items-center justify-around border-t border-[var(--quant-border)] bg-[var(--quant-card)] py-2 text-[11px]"
          >
            <button
              type="button"
              data-testid="calendar-nav-email-btn"
              onClick={() => onBackToEmail?.()}
              className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span>Email</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 font-semibold text-[#0078D4]"
            >
              <div className="relative flex size-5 items-center justify-center rounded border-1.5 border-current text-[10px] font-bold">
                26
              </div>
              <span>Calendar</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              <span>Apps</span>
            </button>
          </nav>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 2. FLOW #26 & #36: NEW / EDIT EVENT SHEET                              */}
      {/* ====================================================================== */}
      {(subScreen === 'new_event' || subScreen === 'edit_event') && (
        <div data-testid="new-event-sheet" className="flex flex-1 flex-col overflow-y-auto bg-[var(--quant-background)]">
          {/* Sheet Top Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-2.5">
            <button
              type="button"
              data-testid="close-event-sheet-btn"
              onClick={() => setSubScreen('main')}
              className="text-base text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            >
              ✕
            </button>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-[#EC4899] text-xs font-bold text-white">
                SL
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-[var(--quant-foreground)]">
                  {subScreen === 'edit_event' ? 'Edit Event' : 'New Event'}
                </span>
                <span className="text-[10px] text-[var(--quant-muted-foreground)]">Calendar</span>
              </div>
            </div>
            <button
              type="button"
              data-testid="save-event-btn"
              onClick={handleSaveEvent}
              className="inline-flex size-8 items-center justify-center rounded-full bg-[#0078D4] text-sm font-bold text-white shadow hover:bg-[#106EBE]"
            >
              ✓
            </button>
          </div>

          {/* Form Content */}
          <div className="p-3.5 space-y-3.5">
            {/* Title Input Card with Red Bullet */}
            <div className="flex items-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-3.5 py-3 shadow-xs">
              <div className="size-2.5 flex-none rounded-full bg-[#EF4444]" />
              <input
                type="text"
                data-testid="event-title-input"
                placeholder="Title"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="w-full bg-transparent text-sm font-medium text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>

            {/* People Selection Card */}
            <div data-testid="event-attendees-row" role="button" tabIndex={0} onClick={() => setShowInviteGuestsSheet(true)} className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-xs cursor-pointer hover:bg-[var(--quant-border)]/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="size-4 text-[var(--quant-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-md bg-[var(--quant-background)] px-2 py-0.5 text-xs font-medium text-[var(--quant-foreground)]">
                      Ms Alex Smith
                    </span>
                    <span className="rounded-md bg-[var(--quant-background)] px-2 py-0.5 text-xs text-[var(--quant-muted-foreground)]">
                      Sam Lee (optional)
                    </span>
                  </div>
                </div>
                <span className="text-xs text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
              </div>
            </div>

            {/* Date, Time & All Day Group */}
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              {/* All Day Toggle */}
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <SvgClock className="size-4 text-[var(--quant-muted-foreground)]" />
                  <span className="text-xs font-medium text-[var(--quant-foreground)]">All Day</span>
                </div>
                <button
                  type="button"
                  data-testid="all-day-toggle"
                  onClick={() => setFormAllDay(prev => !prev)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors ${formAllDay ? 'bg-[#0078D4]' : 'bg-[var(--quant-muted-foreground)]/30'}`}
                >
                  <div className={`size-5 rounded-full bg-white shadow-md transition-transform ${formAllDay ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Split Date & Time Box (Tapping opens Flow #77 Time Picker) */}
              {!formAllDay && (
                <div
                  data-testid="open-time-picker-btn"
                  onClick={() => setSubScreen('time_picker')}
                  className="grid grid-cols-2 divide-x divide-[var(--quant-border)] px-1 py-2 cursor-pointer hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="px-3">
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">Date</span>
                    <p className="text-xs font-semibold text-[var(--quant-foreground)]">{formDate}</p>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">Today</span>
                  </div>
                  <div className="px-3">
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">Time (GMT+7)</span>
                    <p className="text-xs font-semibold text-[var(--quant-foreground)]">{formStartTime} → {formEndTime}</p>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">Duration: {formDuration}</span>
                  </div>
                </div>
              )}

              {/* Time Zone */}
              <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <svg className="size-4 text-[var(--quant-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span className="font-medium text-[var(--quant-foreground)]">Time Zone</span>
                </div>
                <span className="text-[11px] text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
              </div>

              {/* Repeat (Flow #80) */}
              <div
                data-testid="open-repeat-picker-btn"
                onClick={() => setSubScreen('repeat_picker')}
                className="flex items-center justify-between px-3.5 py-2.5 text-xs cursor-pointer hover:bg-[var(--quant-surface-hover)]"
              >
                <div className="flex items-center gap-2.5">
                  <SvgRepeat className="size-4 text-[var(--quant-muted-foreground)]" />
                  <span className="font-medium text-[var(--quant-foreground)]">Repeat</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[var(--quant-muted-foreground)] font-semibold">
                  <span>{formRepeat}</span>
                  <span>&gt;</span>
                </div>
              </div>
            </div>

            {/* Location & Online Meeting Card */}
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <SvgMapPin className="size-4 text-[var(--quant-muted-foreground)]" />
                  <input
                    type="text"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    placeholder="Location"
                    className="bg-transparent text-xs text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:outline-none"
                  />
                </div>
                <span className="text-[11px] text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
              </div>

              {/* Quanty Meet Switch */}
              <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-5 items-center justify-center rounded bg-[#4F46E5] text-white">
                    <SvgVideoMeeting className="size-3.5" />
                  </div>
                  <span className="font-medium text-[var(--quant-foreground)]">Quanty Meeting</span>
                </div>
                <button
                  type="button"
                  data-testid="meeting-toggle"
                  onClick={() => setFormQuantyMeet(prev => !prev)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors ${formQuantyMeet ? 'bg-[#0078D4]' : 'bg-[var(--quant-muted-foreground)]/30'}`}
                >
                  <div className={`size-5 rounded-full bg-white shadow-md transition-transform ${formQuantyMeet ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Description & Attachments Card */}
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              {/* Description (Flow #42) */}
              <div
                data-testid="open-description-btn"
                onClick={() => setSubScreen('event_description')}
                className="flex items-center justify-between px-3.5 py-2.5 text-xs cursor-pointer hover:bg-[var(--quant-surface-hover)]"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="size-4 text-[var(--quant-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="17" y1="10" x2="3" y2="10" />
                    <line x1="21" y1="6" x2="3" y2="6" />
                    <line x1="21" y1="14" x2="3" y2="14" />
                    <line x1="17" y1="18" x2="3" y2="18" />
                  </svg>
                  <span className="font-medium text-[var(--quant-foreground)]">Description</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[var(--quant-muted-foreground)] truncate max-w-[140px]">
                  <span className="truncate">{formDescription}</span>
                  <span>&gt;</span>
                </div>
              </div>

              {/* Attachments (Flow #104) */}
              <div
                data-testid="open-attachments-btn"
                onClick={() => setSubScreen('attachment_action_sheet')}
                className="flex items-center justify-between px-3.5 py-2.5 text-xs cursor-pointer hover:bg-[var(--quant-surface-hover)]"
              >
                <div className="flex items-center gap-2.5">
                  <SvgPaperclip className="size-4 text-[var(--quant-muted-foreground)]" />
                  <span className="font-medium text-[var(--quant-foreground)]">Attachments</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[var(--quant-muted-foreground)]">
                  <span>{formAttachments.length > 0 ? `${formAttachments.length} file` : 'None'}</span>
                  <span>&gt;</span>
                </div>
              </div>
            </div>

            {/* Remind Me & Private Settings Card */}
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <svg className="size-4 text-[var(--quant-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span className="font-medium text-[var(--quant-foreground)]">Remind Me</span>
                </div>
                <span className="text-[11px] text-[var(--quant-muted-foreground)]">{formRemindMe} &gt;</span>
              </div>

              <div className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <svg className="size-4 text-[var(--quant-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="font-medium text-[var(--quant-foreground)]">Private</span>
                </div>
                <button
                  type="button"
                  data-testid="private-toggle"
                  onClick={() => setFormPrivate(prev => !prev)}
                  className={`h-6 w-11 rounded-full p-0.5 transition-colors ${formPrivate ? 'bg-[#0078D4]' : 'bg-[var(--quant-muted-foreground)]/30'}`}
                >
                  <div className={`size-5 rounded-full bg-white shadow-md transition-transform ${formPrivate ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Cancel Event Pill Button in Edit Mode (Flow #36) */}
            {subScreen === 'edit_event' && (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  data-testid="open-cancel-dialog-btn"
                  onClick={() => setSubScreen('cancel_event_dialog')}
                  className="flex items-center gap-2 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-5 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 shadow hover:bg-red-100"
                >
                  <SvgCalendarCancel className="size-4" />
                  <span>Cancel Event</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 3. FLOW #77: SCHEDULING EVENT DATE & TIME PICKER (Drum Wheels)          */}
      {/* ====================================================================== */}
      {subScreen === 'time_picker' && (
        <div data-testid="time-picker-sheet" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          {/* Top Header: < Back, Calendar Icon, "February", ✓ Save */}
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              data-testid="time-picker-back-btn"
              onClick={() => setSubScreen('new_event')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <div className="flex items-center gap-1.5 font-bold text-sm text-[var(--quant-foreground)]">
              <SvgCalendarCheck className="size-4 text-[#0078D4]" />
              <span>February</span>
            </div>
            <button
              type="button"
              data-testid="time-picker-confirm-btn"
              onClick={() => {
                setFormStartTime(`${pickerHour}:${pickerMinute} ${pickerAmPm}`);
                setSubScreen('new_event');
              }}
              className="text-sm font-bold text-[#0078D4]"
            >
              ✓
            </button>
          </div>

          {/* Subheader Tabs: Start Time | End Time */}
          <div className="grid grid-cols-2 border-b border-[var(--quant-border)] bg-[var(--quant-card)] text-center text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTimePickerTab('start')}
              className={`py-3 border-b-2 transition-colors ${timePickerTab === 'start' ? 'border-[#0078D4] text-[#0078D4]' : 'border-transparent text-[var(--quant-muted-foreground)]'}`}
            >
              Start Time
            </button>
            <button
              type="button"
              onClick={() => setTimePickerTab('end')}
              className={`py-3 border-b-2 transition-colors ${timePickerTab === 'end' ? 'border-[#0078D4] text-[#0078D4]' : 'border-transparent text-[var(--quant-muted-foreground)]'}`}
            >
              End Time
            </button>
          </div>

          {/* 4-Column iOS Drum Wheel Picker */}
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="grid grid-cols-4 w-full max-w-[320px] rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 shadow-lg text-center text-xs">
              {/* Column 1: Date */}
              <div className="flex flex-col gap-2 py-4">
                <span className="text-[10px] text-[var(--quant-muted-foreground)] opacity-40">Mon, 23 Feb</span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)] opacity-70">Tue, 24 Feb</span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)]">Yesterday</span>
                <span className="font-bold text-[#0078D4] text-sm py-1 border-y border-[#0078D4]/30">Today</span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)]">Tomorrow</span>
                <span className="text-[11px] text-[var(--quant-muted-foreground)] opacity-70">Sat, 28 Feb</span>
                <span className="text-[10px] text-[var(--quant-muted-foreground)] opacity-40">Sun, 1 Mar</span>
              </div>

              {/* Column 2: Hour */}
              <div className="flex flex-col gap-2 py-4">
                {['7', '8', '9', '10', '11', '12', '1'].map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPickerHour(h)}
                    className={`py-0.5 font-medium ${h === pickerHour ? 'font-bold text-[#0078D4] text-sm border-y border-[#0078D4]/30' : 'text-[var(--quant-foreground)]'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>

              {/* Column 3: Minute */}
              <div className="flex flex-col gap-2 py-4">
                {['45', '50', '55', '00', '05', '10', '15'].map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPickerMinute(m)}
                    className={`py-0.5 font-medium ${m === pickerMinute ? 'font-bold text-[#0078D4] text-sm border-y border-[#0078D4]/30' : 'text-[var(--quant-foreground)]'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Column 4: AM / PM */}
              <div className="flex flex-col gap-3 py-10">
                <button
                  type="button"
                  onClick={() => setPickerAmPm('AM')}
                  className={`py-1 rounded font-bold ${pickerAmPm === 'AM' ? 'text-[#0078D4] text-sm border-y border-[#0078D4]/30' : 'text-[var(--quant-muted-foreground)]'}`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setPickerAmPm('PM')}
                  className={`py-1 rounded font-bold ${pickerAmPm === 'PM' ? 'text-[#0078D4] text-sm border-y border-[#0078D4]/30' : 'text-[var(--quant-muted-foreground)]'}`}
                >
                  PM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 4. FLOW #80: SCHEDULING REPEATING EVENTS SHEET                         */}
      {/* ====================================================================== */}
      {subScreen === 'repeat_picker' && (
        <div data-testid="repeat-picker-sheet" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              data-testid="repeat-back-btn"
              onClick={() => setSubScreen('new_event')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Repeat</h2>
            <div className="size-4" />
          </div>

          <div className="p-4 space-y-4">
            {/* Options List */}
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              {(['None', 'Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  data-testid={`repeat-option-${option.toLowerCase()}`}
                  onClick={() => setFormRepeat(option)}
                  className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
                >
                  <span>{option}</span>
                  {formRepeat === option && <span className="font-bold text-[#0078D4]">✓</span>}
                </button>
              ))}
            </div>

            {/* Recurrence Interval & Until Settings */}
            {formRepeat !== 'None' && (
              <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
                <div className="flex items-center justify-between px-4 py-3 text-xs">
                  <div className="flex flex-col text-left">
                    <span className="font-medium text-[var(--quant-foreground)]">Interval</span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">{formRepeatInterval}</span>
                  </div>
                  <span className="text-xs text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
                </div>
                <div
                  data-testid="open-repeat-until-btn"
                  onClick={() => setSubScreen('repeat_until_picker')}
                  className="flex items-center justify-between px-4 py-3 text-xs cursor-pointer hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium text-[var(--quant-foreground)]">Until</span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">{formRepeatUntil}</span>
                  </div>
                  <span className="text-xs text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
                </div>
              </div>
            )}

            {formRepeat !== 'None' && (
              <p className="px-2 text-[11px] text-[var(--quant-muted-foreground)]">
                Repeats {formRepeat.toLowerCase()} until {formRepeatUntil} 2026
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sub-Screen: Repeat Until Picker (Flow #80 Screen 3) */}
      {subScreen === 'repeat_until_picker' && (
        <div data-testid="repeat-until-sheet" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              onClick={() => setSubScreen('repeat_picker')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Repeat Until</h2>
            <div className="size-4" />
          </div>

          <div className="p-4 space-y-4">
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--quant-foreground)]">
                <span>Forever</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-[var(--quant-foreground)]">
                <span>Specific date</span>
                <span className="text-[#0078D4] font-bold">✓</span>
              </div>
            </div>

            {/* Mini Month Picker for Specific Date */}
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-xs">
              <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--quant-muted-foreground)] pb-2 border-b border-[var(--quant-border)]">
                <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 text-center text-xs gap-y-1.5 pt-2">
                {[16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setFormRepeatUntil(`Wed, ${d} Aug`);
                      setSubScreen('repeat_picker');
                    }}
                    className={`size-7 mx-auto flex items-center justify-center rounded-full ${
                      d === 26 ? 'bg-[#0078D4] text-white font-bold' : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 5. FLOW #43: EVENT DETAIL VIEW                                         */}
      {/* ====================================================================== */}
      {subScreen === 'event_detail' && activeEvent && (
        <div data-testid="event-detail-screen" className="flex flex-1 flex-col overflow-y-auto bg-[var(--quant-background)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-2.5">
            <button
              type="button"
              data-testid="event-detail-back-btn"
              onClick={() => setSubScreen('main')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <div className="flex flex-col text-center">
              <h2 className="text-xs font-bold text-[var(--quant-foreground)]">Calendar</h2>
              <span className="text-[10px] text-[var(--quant-muted-foreground)]">samlee@quantrinity.in</span>
            </div>
            <button
              type="button"
              data-testid="edit-event-pencil-btn"
              onClick={() => {
                setFormTitle(activeEvent.title);
                setFormLocation(activeEvent.location || '');
                setFormDescription(activeEvent.fullDescription || '');
                setSubScreen('edit_event');
              }}
              className="inline-flex size-8 items-center justify-center text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>

          <div className="p-3.5 space-y-3.5">
            {/* Card 1: Event Summary & Description */}
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="size-2.5 mt-1.5 flex-none rounded-full bg-[#00838F]" />
                <div className="flex-1">
                  <h1 className="text-base font-bold text-[var(--quant-foreground)]">{activeEvent.title}</h1>
                  <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                    Thursday, 26 February 2026<br />
                    {activeEvent.startTime} → {activeEvent.endTime} ({activeEvent.duration})
                  </p>
                  {activeEvent.recurrence && (
                    <p className="mt-1 text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                      {activeEvent.recurrence}
                    </p>
                  )}
                </div>
              </div>

              {/* Description Snippet & Attachment Pill */}
              <div
                data-testid="event-snippet-desc"
                onClick={() => setSubScreen('event_description')}
                className="mt-3 flex items-center justify-between border-t border-[var(--quant-border)] pt-3 text-xs text-[var(--quant-foreground)] cursor-pointer hover:bg-[var(--quant-surface-hover)] rounded-lg p-1.5"
              >
                <div className="flex-1 truncate">
                  <p className="truncate text-xs text-[var(--quant-foreground)]">{activeEvent.descriptionSnippet}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[var(--quant-muted-foreground)]">
                  <SvgPaperclip className="size-3.5" />
                  <span className="font-semibold">&gt;</span>
                </div>
              </div>
            </div>

            {/* Card 2: Interactive Map Preview + Address & Meet Join */}
            <div className="overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] shadow-xs">
              {/* Map Illustration Tile (River, Parks, Streets, Pin) */}
              <div className="relative h-28 w-full bg-[#D4E6D5] dark:bg-[#1E2E23]">
                {/* Simulated River Blue Wave */}
                <svg className="absolute inset-0 size-full opacity-60" viewBox="0 0 300 120" preserveAspectRatio="none">
                  <path d="M0,40 Q90,90 180,30 T300,50 L300,120 L0,120 Z" fill="#93C5FD" />
                  <path d="M40,0 L70,120 M140,0 L160,120 M240,0 L210,120" stroke="#CBD5E1" strokeWidth="3" fill="none" />
                </svg>
                <span className="absolute bottom-2 left-4 text-[10px] font-semibold text-gray-700 dark:text-gray-300">St Lucia</span>
                <span className="absolute top-2 right-4 text-[10px] font-semibold text-gray-700 dark:text-gray-300">Dutton Park</span>

                {/* Red Location Pin on Map */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                  <div className="size-4 rounded-full bg-[#EF4444] border-2 border-white shadow-md animate-bounce" />
                  <div className="size-1 rounded-full bg-black/40 blur-2xs" />
                </div>
              </div>

              {/* Location Address Row */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--quant-border)]">
                <SvgMapPin className="size-4 text-[var(--quant-muted-foreground)]" />
                <span className="text-xs font-medium text-[#0078D4] underline cursor-pointer">{activeEvent.location}</span>
              </div>

              {/* Quanty Meeting Row with Join Button */}
              {activeEvent.isOnlineMeeting && (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-6 items-center justify-center rounded bg-[#4F46E5] text-white">
                      <SvgVideoMeeting className="size-4" />
                    </div>
                    <span className="text-xs font-medium text-[var(--quant-foreground)]">Quanty Meeting</span>
                  </div>
                  <button
                    type="button"
                    data-testid="join-meeting-btn"
                    onClick={() => setShowOpenWithSheet(true)}
                    className="rounded-lg border border-[#0078D4] px-3.5 py-1 text-xs font-semibold text-[#0078D4] hover:bg-[#0078D4] hover:text-white transition-colors"
                  >
                    Join
                  </button>
                </div>
              )}
            </div>

            {/* Card 3: Organizer */}
            <div className="flex items-center justify-between rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-[#EC4899] font-bold text-white text-xs">
                  {activeEvent.organizer.initials}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-[var(--quant-foreground)]">{activeEvent.organizer.name}</span>
                  <span className="text-[10px] text-[var(--quant-muted-foreground)]">{activeEvent.organizer.email}</span>
                </div>
              </div>
              <span className="text-xs text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
            </div>

            {/* Card 4: Show More Collapsible */}
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--quant-foreground)]">Show More</h4>
                  <p className="text-[10px] text-[var(--quant-muted-foreground)]">15 minutes before, Busy, QuantMail</p>
                </div>
                <span className="text-xs text-[var(--quant-muted-foreground)] font-semibold">⌄</span>
              </div>
            </div>

            {/* Bottom Big Action Button: Email Organizer */}
            <div className="pt-2">
              <button
                type="button"
                data-testid="email-organizer-btn"
                onClick={() => triggerToast(`Composing email to ${activeEvent.organizer.name}...`)}
                className="w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] py-3 text-center text-xs font-bold text-[#0078D4] shadow-sm hover:bg-[var(--quant-surface-hover)]"
              >
                Email {activeEvent.organizer.name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 6. FLOW #16: CANCELING AN EVENT MODAL DIALOG                           */}
      {/* ====================================================================== */}
      {subScreen === 'cancel_event_dialog' && activeEvent && (
        <div data-testid="cancel-event-modal" className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-xs">
          <div className="w-full max-w-[320px] rounded-2xl bg-[var(--quant-card)] p-4 shadow-2xl border border-[var(--quant-border)] animate-scale-up">
            {/* Modal Header */}
            <div className="flex items-start gap-3">
              <div className="flex size-9 flex-none items-center justify-center rounded-xl bg-[var(--quant-background)] text-[var(--quant-foreground)]">
                <SvgCalendarCancel className="size-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-[var(--quant-foreground)]">{activeEvent.title}</h3>
                <span className="text-[11px] text-[var(--quant-muted-foreground)]">{activeEvent.organizer.name}</span>
              </div>
            </div>

            {/* Note Textarea Input */}
            <div className="mt-3">
              <textarea
                data-testid="cancel-reason-input"
                rows={3}
                value={cancelNote}
                onChange={e => setCancelNote(e.target.value)}
                className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] p-2.5 text-xs text-[var(--quant-foreground)] focus:border-[#0078D4] focus:outline-none"
              />
            </div>

            {/* Modal Action Links */}
            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--quant-border)] pt-3 text-center text-xs">
              <button
                type="button"
                data-testid="send-cancellation-btn"
                onClick={handleConfirmCancelEvent}
                className="font-bold text-[#0078D4] hover:underline"
              >
                Send Cancellation
              </button>
              <button
                type="button"
                onClick={() => setSubScreen('edit_event')}
                className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 7. FLOW #42: EVENT DESCRIPTION SCREEN                                  */}
      {/* ====================================================================== */}
      {subScreen === 'event_description' && activeEvent && (
        <div data-testid="event-description-screen" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              onClick={() => setSubScreen('event_detail')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Description</h2>
            <div className="size-4" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Attached File Card Badge */}
            {formAttachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded bg-red-100 dark:bg-red-950 text-red-600 font-bold text-[10px]">
                    PDF
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-[var(--quant-foreground)]">{att.name}</span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">{att.size}</span>
                  </div>
                </div>
                <span className="text-xs text-[var(--quant-muted-foreground)]">⋮</span>
              </div>
            ))}

            {/* Description Text Body */}
            <p className="text-xs text-[var(--quant-foreground)] leading-relaxed">
              {formDescription}
            </p>

            <hr className="border-[var(--quant-border)]" />

            {/* Online Meeting Join Credentials */}
            <div className="space-y-2 pt-2">
              <h3 className="text-base font-bold text-[var(--quant-foreground)]">Quanty Meeting</h3>
              <p className="text-[11px] text-[var(--quant-muted-foreground)]">Join on your computer, mobile app or room device</p>
              <p className="text-xs font-medium text-[#0078D4] underline cursor-pointer">
                Click here to join the meeting
              </p>
              <div className="mt-3 text-xs text-[var(--quant-foreground)] space-y-1">
                <p>Meeting ID: <span className="font-semibold">{activeEvent.meetingId}</span></p>
                <p>Passcode: <span className="font-semibold">{activeEvent.passcode}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 8. FLOW #91: LEFT CALENDAR DRAWER & SHARE CALENDAR                     */}
      {/* ====================================================================== */}
      {subScreen === 'calendar_drawer' && (
        <div data-testid="calendar-drawer" className="absolute inset-0 z-50 flex bg-black/60">
          <div className="flex h-full w-[310px] flex-col bg-[var(--quant-card)] shadow-2xl animate-slide-right">
            {/* Drawer Header: Account Info */}
            <div className="border-b border-[var(--quant-border)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-[#EC4899] font-bold text-white text-sm">
                  SL
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-[var(--quant-foreground)]">QuantMail</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">samlee@quantrinity.in</span>
                </div>
              </div>
            </div>

            {/* Drawer Body: My Calendars */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <span className="text-[11px] font-bold text-[var(--quant-muted-foreground)] uppercase tracking-wider">
                ⌄ My Calendars
              </span>

              <div className="flex items-center justify-between rounded-xl bg-[var(--quant-background)] p-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-5 items-center justify-center rounded-full bg-[#EF4444] text-white text-[10px] font-bold">
                    ✓
                  </div>
                  <span className="text-xs font-semibold text-[var(--quant-foreground)]">Calendar</span>
                </div>

                {/* Settings Gear opens Flow #91 Share Screen */}
                <button
                  type="button"
                  data-testid="share-calendar-gear-btn"
                  onClick={() => setSubScreen('share_calendar_add_people')}
                  className="inline-flex size-7 items-center justify-center rounded text-[var(--quant-muted-foreground)] hover:text-[#0078D4]"
                >
                  ⚙
                </button>
              </div>
            </div>

            {/* Drawer Footer: Close */}
            <div className="border-t border-[var(--quant-border)] p-4">
              <button
                type="button"
                onClick={() => setSubScreen('main')}
                className="w-full rounded-xl border border-[var(--quant-border)] py-2.5 text-center text-xs font-semibold text-[var(--quant-foreground)]"
              >
                Close Drawer
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setSubScreen('main')} />
        </div>
      )}

      {/* Sub-Screen: Add People to Share Calendar (Flow #91 Screen 3) */}
      {subScreen === 'share_calendar_add_people' && (
        <div data-testid="share-add-people-screen" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              onClick={() => setSubScreen('calendar_drawer')}
              className="text-sm font-semibold text-[#0078D4]"
            >
              &lt;
            </button>
            <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Add People</h2>
            <button
              type="button"
              data-testid="confirm-share-people-btn"
              onClick={() => {
                triggerToast('Calendar invitation sent');
                setSubScreen('main');
              }}
              className="text-sm font-bold text-[#0078D4]"
            >
              →
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-2.5 shadow-xs">
              <input
                type="text"
                data-testid="share-search-input"
                placeholder="Type a name or email address"
                value={shareSearchQuery}
                onChange={e => setShareSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>

            {/* Suggestions List */}
            <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
              {[
                { name: 'Alex Smith', email: 'alexsmith@quantrinity.in', initials: 'AS' },
                { name: 'Sam Lee', email: 'samlee@quantrinity.in', initials: 'SL' },
                { name: 'Design Team', email: 'design@quantrinity.in', initials: 'DT' },
              ].map((person, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setSharedPeople(prev => [...prev, person]);
                    triggerToast(`Added ${person.name} to shared list`);
                  }}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--quant-surface-hover)]"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-[#EC4899] text-xs font-bold text-white">
                    {person.initials}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-[var(--quant-foreground)]">{person.name}</span>
                    <span className="text-[10px] text-[var(--quant-muted-foreground)]">{person.email}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* 9. FLOW #104: UPLOADING A FILE / EVENT ATTACHMENT                      */}
      {/* ====================================================================== */}
      {subScreen === 'attachment_action_sheet' && (
        <div data-testid="attachment-action-sheet" className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
          <div className="w-full max-w-[360px] space-y-2 animate-slide-up">
            <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] text-center text-sm font-medium">
              <button
                type="button"
                data-testid="action-attach-file"
                onClick={() => setSubScreen('attach_file_picker')}
                className="w-full py-3.5 text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
              >
                Attach File
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormAttachments(prev => [...prev, { name: 'Photo_2026.jpg', size: '2.4 MB', type: 'image' }]);
                  triggerToast('Attached last photo');
                  setSubScreen('new_event');
                }}
                className="w-full py-3.5 text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
              >
                Use Last Photo Taken
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormAttachments(prev => [...prev, { name: 'Library_Pic.png', size: '1.8 MB', type: 'image' }]);
                  triggerToast('Attached library photo');
                  setSubScreen('new_event');
                }}
                className="w-full py-3.5 text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
              >
                Choose Photo From Library
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSubScreen('new_event')}
              className="w-full rounded-2xl bg-[var(--quant-card)] border border-[var(--quant-border)] py-3.5 text-center text-sm font-semibold text-[#0078D4]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sub-Screen: Attach a File Location Picker (Flow #104 Screen 2) */}
      {subScreen === 'attach_file_picker' && (
        <div data-testid="attach-file-picker-screen" className="flex flex-1 flex-col bg-[var(--quant-background)]">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 py-3">
            <button
              type="button"
              onClick={() => setSubScreen('new_event')}
              className="text-base text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            >
              ✕
            </button>
            <h2 className="text-sm font-bold text-[var(--quant-foreground)]">Attach a File</h2>
            <div className="size-4" />
          </div>

          <div className="p-4 space-y-4">
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-2 shadow-xs">
              <input
                type="text"
                placeholder="Search"
                className="w-full bg-transparent text-xs text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)]">Suggested</span>
              <p className="text-[10px] text-[var(--quant-muted-foreground)]">QuantDrive · samlee@quantrinity.in</p>
              <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] shadow-xs">
                {['My Files', 'Recent', 'Email Attachments'].map((loc, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setFormAttachments(prev => [...prev, { name: `${loc}_doc.pdf`, size: '120 KB', type: 'pdf' }]);
                      triggerToast(`Attached file from ${loc}`);
                      setSubScreen('new_event');
                    }}
                    className="flex items-center justify-between p-3.5 text-xs text-[var(--quant-foreground)] cursor-pointer hover:bg-[var(--quant-surface-hover)]"
                  >
                    <span>{loc}</span>
                    <span className="text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--quant-muted-foreground)]">Other Locations</span>
              <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 text-xs text-[var(--quant-foreground)] shadow-xs flex items-center justify-between cursor-pointer hover:bg-[var(--quant-surface-hover)]">
                <span>iCloud Drive & Device</span>
                <span className="text-[var(--quant-muted-foreground)] font-semibold">&gt;</span>
              </div>
            </div>
          </div>
        </div>
      )}
    
      {/* Flow #54: Invite Guests Sheet */}
      {showInviteGuestsSheet && (
        <MobileInviteGuestsSheet
          isOpen={true}
          onClose={() => setShowInviteGuestsSheet(false)}
          onSaveAttendees={() => setShowInviteGuestsSheet(false)}
        />
      )}

      {/* Flow #55: Open With Action Sheet */}
      {showOpenWithSheet && (
        <div
          data-testid="open-meeting-with-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 px-4 pb-6"
        >
          <div className="overflow-hidden rounded-2xl bg-[var(--quant-card)] dark:bg-[#1C1C1E] p-4 text-[var(--quant-foreground)] shadow-2xl space-y-3">
            <h3 className="text-center text-xs font-bold text-[var(--quant-muted-foreground)] uppercase">Open Meeting With</h3>
            <div className="divide-y divide-[var(--quant-border)] text-sm font-semibold">
              <button
                type="button"
                data-testid="open-app-quanty-meet"
                onClick={() => {
                  setShowOpenWithSheet(false);
                  triggerToast('Joining meeting via Quanty Meet...');
                }}
                className="flex w-full items-center gap-3 py-3 hover:bg-[var(--quant-border)]/20"
              >
                <span>🎥</span>
                <span>Quanty Meet App</span>
              </button>
              <button
                type="button"
                data-testid="open-app-safari"
                onClick={() => {
                  setShowOpenWithSheet(false);
                  triggerToast('Joining meeting in browser...');
                }}
                className="flex w-full items-center gap-3 py-3 hover:bg-[var(--quant-border)]/20"
              >
                <span>🌐</span>
                <span>Safari / Browser</span>
              </button>
            </div>
            <button
              type="button"
              data-testid="cancel-open-meeting-btn"
              onClick={() => setShowOpenWithSheet(false)}
              className="mt-2 w-full rounded-xl bg-[var(--quant-border)] py-2.5 text-center text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
</div>
  );
}
