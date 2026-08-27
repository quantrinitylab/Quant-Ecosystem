// ============================================================================
// Indian Holiday & Festival Calendar
// Complete Indian National Holidays, Festivals & Observances (2026-2027)
// ============================================================================

export interface Holiday {
  date: string; // yyyy-mm-dd
  name: string;
  kind: 'national' | 'festival' | 'observance';
  description?: string;
}

export const HOLIDAYS: Holiday[] = [
  // ---- 2026 -----------------------------------------------------------------
  { date: '2026-01-01', name: "New Year's Day", kind: 'observance' },
  {
    date: '2026-01-14',
    name: 'Makar Sankranti / Pongal',
    kind: 'festival',
    description: 'Harvest Festival',
  },
  { date: '2026-01-26', name: 'Republic Day', kind: 'national', description: 'National Holiday' },
  {
    date: '2026-02-16',
    name: 'Maha Shivratri',
    kind: 'festival',
    description: 'Great Night of Shiva',
  },
  { date: '2026-03-03', name: 'Holi', kind: 'festival', description: 'Festival of Colours' },
  { date: '2026-03-20', name: 'Gudi Padwa / Ugadi', kind: 'festival', description: 'New Year Day' },
  { date: '2026-03-21', name: 'Eid al-Fitr', kind: 'festival', description: 'Islamic Festival' },
  { date: '2026-03-26', name: 'Ram Navami', kind: 'festival', description: 'Birth of Lord Rama' },
  {
    date: '2026-04-03',
    name: 'Good Friday',
    kind: 'observance',
    description: 'Christian Observance',
  },
  {
    date: '2026-04-14',
    name: 'Ambedkar Jayanti / Baisakhi',
    kind: 'national',
    description: 'National Holiday',
  },
  { date: '2026-05-01', name: 'Labour Day / Maharashtra Day', kind: 'observance' },
  {
    date: '2026-05-27',
    name: 'Eid al-Adha (Bakrid)',
    kind: 'festival',
    description: 'Feast of the Sacrifice',
  },
  {
    date: '2026-08-15',
    name: 'Independence Day',
    kind: 'national',
    description: '79th Independence Day',
  },
  {
    date: '2026-08-26',
    name: 'Janmashtami',
    kind: 'festival',
    description: 'Birth of Lord Krishna',
  },
  {
    date: '2026-08-28',
    name: 'Raksha Bandhan',
    kind: 'festival',
    description: 'Bond of Protection',
  },
  {
    date: '2026-09-14',
    name: 'Ganesh Chaturthi',
    kind: 'festival',
    description: 'Vinayaka Chaturthi',
  },
  {
    date: '2026-10-02',
    name: 'Mahatma Gandhi Jayanti',
    kind: 'national',
    description: 'National Holiday',
  },
  {
    date: '2026-10-11',
    name: 'First Day of Sharad Navratri',
    kind: 'festival',
    description: 'Navratri Begins',
  },
  {
    date: '2026-10-17',
    name: 'First Day of Durga Puja',
    kind: 'festival',
    description: 'Durga Puja Festivities',
  },
  { date: '2026-10-18', name: 'Maha Saptami', kind: 'festival', description: 'Durga Puja Day 7' },
  { date: '2026-10-19', name: 'Maha Ashtami', kind: 'festival', description: 'Durga Puja Day 8' },
  {
    date: '2026-10-20',
    name: 'Dussehra / Vijayadashami',
    kind: 'festival',
    description: 'Triumph of Good over Evil',
  },
  { date: '2026-10-26', name: 'Maharishi Valmiki Jayanti', kind: 'observance' },
  { date: '2026-10-29', name: 'Karaka Chaturthi (Karwa Chauth)', kind: 'festival' },
  { date: '2026-11-06', name: 'Dhanteras', kind: 'festival', description: 'Festival of Wealth' },
  {
    date: '2026-11-08',
    name: 'Diwali (Deepavali)',
    kind: 'festival',
    description: 'Festival of Lights',
  },
  { date: '2026-11-09', name: 'Govardhan Puja', kind: 'festival' },
  { date: '2026-11-10', name: 'Bhai Dooj', kind: 'festival' },
  {
    date: '2026-11-15',
    name: 'Chhath Puja',
    kind: 'festival',
    description: 'Sun Worship Festival',
  },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', kind: 'festival', description: 'Gurpurab' },
  { date: '2026-12-25', name: 'Christmas', kind: 'festival', description: 'Christmas Day' },

  // ---- 2027 -----------------------------------------------------------------
  { date: '2027-01-01', name: "New Year's Day", kind: 'observance' },
  { date: '2027-01-14', name: 'Makar Sankranti', kind: 'festival' },
  { date: '2027-01-26', name: 'Republic Day', kind: 'national' },
  { date: '2027-03-22', name: 'Holi', kind: 'festival' },
  { date: '2027-04-15', name: 'Ram Navami', kind: 'festival' },
  { date: '2027-05-01', name: 'Labour Day', kind: 'observance' },
  { date: '2027-08-15', name: 'Independence Day', kind: 'national' },
  { date: '2027-10-02', name: 'Gandhi Jayanti', kind: 'national' },
  { date: '2027-10-29', name: 'Diwali', kind: 'festival' },
  { date: '2027-12-25', name: 'Christmas', kind: 'festival' },
];

/** yyyy-mm-dd for a local date, without UTC drift. */
export function localKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** All holidays in a given month, keyed by day-of-month. */
export function holidaysForMonth(year: number, month: number): Record<number, Holiday[]> {
  const prefix = `${year}-${`${month + 1}`.padStart(2, '0')}-`;
  const map: Record<number, Holiday[]> = {};
  for (const holiday of HOLIDAYS) {
    if (!holiday.date.startsWith(prefix)) continue;
    const day = Number(holiday.date.slice(-2));
    map[day] = [...(map[day] ?? []), holiday];
  }
  return map;
}

export function holidaysOn(date: Date): Holiday[] {
  const key = localKey(date);
  return HOLIDAYS.filter((holiday) => holiday.date === key);
}
