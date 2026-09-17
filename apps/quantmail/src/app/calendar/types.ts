import React from 'react';
import {
  IconActivity,
  IconAlertCircle,
  IconBan,
  IconBed,
  IconBolt,
  IconBrain,
  IconCheckCircle,
  IconCircle,
  IconClock,
  IconCloud,
  IconDroplet,
  IconEyeOff,
  IconFlame,
  IconFlask,
  IconFlower,
  IconHeart,
  IconLayers,
  IconMinus,
  IconRefresh,
  IconShield,
  IconSparkle,
  IconStar,
  IconSun,
  IconTrendDown,
  IconTrendUp,
  IconUndo,
  IconWave,
} from '../../components/icons';

export const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const MONTHS_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export type EntryType = 'event' | 'task' | 'birthday' | 'period';

export interface CalendarEventLike {
  id: string;
  title: string;
  startTime?: string | Date;
  endTime?: string | Date;
  start?: string | Date;
  end?: string | Date;
  location?: string;
  description?: string;
  allDay?: boolean;
  type?: EntryType | string;
  color?: string;
  recurrence?: string;
  reminders?: string[];
  attendees?: string[];
  completed?: boolean;
  priority?: 'low' | 'medium' | 'urgent';
  subtasks?: Array<{ text: string; done: boolean }>;
  flowIntensity?: 'light' | 'medium' | 'heavy' | 'super_heavy' | 'spotting';
  spottingColor?: 'red' | 'brown';
  collectionMethod?: string;
  symptoms?: string[];
  moods?: string[];
  pain?: string[];
  sleep?: string;
  sexLife?: string;
  energy?: string;
  intimateHealth?: string;
  hotFlashes?: string;
  bbt?: string;
  weight?: string;
  customTags?: string[];
  cycleDay?: number;
  accountEmail?: string;
  driveLink?: string;
  timezone?: string;
}

export type CalendarView = 'agenda' | 'week' | 'day' | 'month';

export const CALENDAR_VIEWS: ReadonlyArray<{ key: CalendarView; label: string }> = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'month', label: 'Month' },
];

export type DayMarkFlags = {
  hasHoliday?: boolean;
  hasPeriod?: boolean;
  hasBirthday?: boolean;
  hasTask?: boolean;
  hasPlainEvent?: boolean;
};

export const DAY_MARKS: Array<{ key: keyof DayMarkFlags; color: string; label: string }> = [
  { key: 'hasHoliday', color: '#FF8C42', label: 'holiday' },
  { key: 'hasPeriod', color: '#FB7185', label: 'cycle entry' },
  { key: 'hasBirthday', color: '#34D399', label: 'birthday' },
  { key: 'hasTask', color: '#FFB875', label: 'task' },
  { key: 'hasPlainEvent', color: '#A1A4AC', label: 'event' },
];

export function dayMarkLabel(flags: DayMarkFlags): string {
  const labels = DAY_MARKS.filter((mark) => flags[mark.key]).map((mark) => mark.label);
  return labels.length === 0 ? '' : `, has ${labels.join(', ')}`;
}

export const TIMEZONES = [
  { label: 'India Standard Time (IST, UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'Greenwich Mean Time (UTC / GMT+0)', value: 'UTC' },
  { label: 'US Eastern Time (EDT/EST, UTC-4)', value: 'America/New_York' },
  { label: 'US Central Time (CDT/CST, UTC-5)', value: 'America/Chicago' },
  { label: 'US Pacific Time (PDT/PST, UTC-7)', value: 'America/Los_Angeles' },
  { label: 'British Summer Time (BST, UTC+1)', value: 'Europe/London' },
  { label: 'Central European Time (CEST, UTC+2)', value: 'Europe/Berlin' },
  { label: 'Gulf Standard Time (GST, UTC+4)', value: 'Asia/Dubai' },
  { label: 'Singapore / Hong Kong (SGT/HKT, UTC+8)', value: 'Asia/Singapore' },
  { label: 'Japan Standard Time (JST, UTC+9)', value: 'Asia/Tokyo' },
  { label: 'Australian Eastern Time (AEST, UTC+10)', value: 'Australia/Sydney' },
];

export const RECURRENCE_OPTIONS = [
  'Does not repeat',
  'Daily',
  'Every weekday (Monday to Friday)',
  'Weekly',
  'Monthly',
  'Annually (Every year)',
  'Custom interval…',
];

export const CLUE_FEELINGS = [
  { id: 'mood_swings', label: 'Mood swings', Icon: IconWave },
  { id: 'not_in_control', label: 'Not in control', Icon: IconRefresh },
  { id: 'fine', label: 'Fine', Icon: IconCloud },
  { id: 'happy', label: 'Happy', Icon: IconSun },
  { id: 'sad', label: 'Sad', Icon: IconDroplet },
  { id: 'sensitive', label: 'Sensitive', Icon: IconFlower },
  { id: 'angry', label: 'Angry', Icon: IconFlame },
  { id: 'confident', label: 'Confident', Icon: IconStar },
  { id: 'excited', label: 'Excited', Icon: IconSparkle },
  { id: 'irritable', label: 'Irritable', Icon: IconBolt },
  { id: 'anxious', label: 'Anxious', Icon: IconActivity },
  { id: 'insecure', label: 'Insecure', Icon: IconEyeOff },
  { id: 'grateful', label: 'Grateful', Icon: IconHeart },
  { id: 'indifferent', label: 'Indifferent', Icon: IconMinus },
];

export const CLUE_COLLECTION_METHODS = [
  { id: 'pad', label: 'Pad', Icon: IconLayers },
  { id: 'tampon', label: 'Tampon', Icon: IconDroplet },
  { id: 'panty_liner', label: 'Panty liner', Icon: IconMinus },
  { id: 'cup', label: 'Menstrual cup', Icon: IconFlask },
];

export const CLUE_PAIN = [
  { id: 'pain_free', label: 'Pain free', Icon: IconCheckCircle },
  { id: 'cramps', label: 'Cramps', Icon: IconBolt },
  { id: 'ovulation', label: 'Ovulation', Icon: IconCircle },
  { id: 'breast_tenderness', label: 'Breast tenderness', Icon: IconHeart },
  { id: 'headache', label: 'Headache', Icon: IconBrain },
  { id: 'backache', label: 'Backache', Icon: IconLayers },
];

export const CLUE_SLEEP = [
  { id: 'trouble_sleeping', label: 'Trouble falling asleep', Icon: IconClock },
  { id: 'refreshed', label: 'Woke up refreshed', Icon: IconSun },
  { id: 'tired', label: 'Woke up tired', Icon: IconTrendDown },
  { id: 'restless', label: 'Restless sleep', Icon: IconRefresh },
];

export const CLUE_SEX_LIFE = [
  { id: 'protected', label: 'Protected', Icon: IconShield },
  { id: 'unprotected', label: 'Unprotected', Icon: IconAlertCircle },
  { id: 'withdrawal', label: 'Withdrawal', Icon: IconUndo },
  { id: 'no_sex', label: 'No sex', Icon: IconBan },
];

export const CLUE_ENERGY = [
  { id: 'exhausted', label: 'Exhausted', Icon: IconBed },
  { id: 'tired', label: 'Tired', Icon: IconTrendDown },
  { id: 'ok', label: 'OK', Icon: IconMinus },
  { id: 'energetic', label: 'Energetic', Icon: IconTrendUp },
];

export const CLUE_INTIMATE = [
  { id: 'normal', label: 'Normal / Good', Icon: IconCheckCircle },
  { id: 'dryness', label: 'Vaginal dryness', Icon: IconSun },
  { id: 'itchy', label: 'Itchy', Icon: IconActivity },
  { id: 'sore', label: 'Sore', Icon: IconFlame },
];

export const CLUE_HOT_FLASHES = [
  { id: 'none', label: 'None today', flames: 0 },
  { id: 'mild', label: 'Mild', flames: 1 },
  { id: 'moderate', label: 'Moderate', flames: 2 },
  { id: 'severe', label: 'Severe', flames: 3 },
];

export const NOTIFICATION_SLIDER_VALUES = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 45, label: '45 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 10080, label: '1 week before' },
];

export interface FormState {
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timezone: string;
  location: string;
  description: string;
  recurrence: string;
  color: string;
  accountEmail: string;
  notifications: string[];
  attendeeInput: string;
  attendees: string[];
  driveLink: string;
  priority: 'low' | 'medium' | 'urgent';
  subtaskInput: string;
  subtasks: Array<{ text: string; done: boolean }>;
  birthYear: string;
  giftIdeas: string;
  flowIntensity: 'light' | 'medium' | 'heavy' | 'super_heavy' | 'spotting';
  spottingColor: 'red' | 'brown';
  collectionMethod: string;
  feelings: string[];
  pain: string[];
  pms: boolean;
  sleep: string;
  sexLife: string;
  energy: string;
  intimateHealth: string;
  hotFlashes: string;
  bbt: string;
  weight: string;
  customTagInput: string;
  customTags: string[];
  periodDays: number;
  cycleLength: number;
  currentCycleDay: number;
}
