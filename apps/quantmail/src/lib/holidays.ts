// ============================================================================
// Indian holiday calendar (static table).
// Google Calendar shows named days inline in the month grid; QuantMail does the
// same from this table so a month never looks empty. Dates are ISO yyyy-mm-dd
// in local terms (no timezone shifting) and cover the current + next year.
// ============================================================================

export interface Holiday {
  date: string; // yyyy-mm-dd
  name: string;
  kind: 'national' | 'festival' | 'observance';
}

export const HOLIDAYS: Holiday[] = [
  // ---- 2026 -----------------------------------------------------------------
  { date: '2026-01-01', name: "New Year's Day", kind: 'observance' },
  { date: '2026-01-14', name: 'Makar Sankranti', kind: 'festival' },
  { date: '2026-01-26', name: 'Republic Day', kind: 'national' },
  { date: '2026-03-03', name: 'Holi', kind: 'festival' },
  { date: '2026-03-21', name: 'Eid al-Fitr', kind: 'festival' },
  { date: '2026-03-26', name: 'Ram Navami', kind: 'festival' },
  { date: '2026-04-14', name: 'Ambedkar Jayanti', kind: 'national' },
  { date: '2026-05-01', name: 'Labour Day', kind: 'observance' },
  { date: '2026-05-27', name: 'Eid al-Adha', kind: 'festival' },
  { date: '2026-08-15', name: 'Independence Day', kind: 'national' },
  { date: '2026-08-26', name: 'Janmashtami', kind: 'festival' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', kind: 'festival' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', kind: 'national' },
  { date: '2026-10-20', name: 'Dussehra', kind: 'festival' },
  { date: '2026-11-08', name: 'Diwali', kind: 'festival' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', kind: 'festival' },
  { date: '2026-12-25', name: 'Christmas', kind: 'festival' },
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
