import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { QuantCliClient } from '../client.js';
import { loadConfig } from '../config.js';

export interface CalendarEventItem {
  id: string;
  title: string;
  description?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  allDay?: boolean;
  location?: string | null;
  status?: string;
  timeZone?: string;
  recurrenceRule?: string | null;
  attendees?: Array<{ email: string; name?: string; status?: string } | string>;
}

export interface BookingLinkDetails {
  id: string;
  title: string;
  slug: string;
  duration: number;
  description?: string | null;
  timeZone?: string;
  host?: {
    name?: string;
    email?: string;
  };
}

export interface AvailableSlotItem {
  slot: string;
  available?: boolean;
}

/**
 * Formats time into a neat 12-hour AM/PM string (e.g. '10:30 AM').
 */
export function formatEventTime(dateInput: string | Date): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Formats date into human-readable string (e.g. 'Fri, Sep 25, 2026').
 */
export function formatEventDate(dateInput: string | Date): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats ISO date to YYYY-MM-DD.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Registers all `quant calendar` commands matching Google Calendar & Calendly CLI.
 */
export function registerCalendarCommands(program: Command): void {
  const calendar = program
    .command('calendar')
    .description('QuantCalendar schedule inspection, agenda view, and Calendly-class slot booking');

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant calendar agenda
  // ─────────────────────────────────────────────────────────────────────────────
  calendar
    .command('agenda')
    .description('Display upcoming events for today and the next 7 days in clean agenda format')
    .option('-d, --days <number>', 'Number of days to display in agenda view', '7')
    .option('--json', 'Output agenda events in JSON format')
    .option('-a, --all', 'Include past events from earlier today')
    .action(async (options: { days?: string; json?: boolean; all?: boolean }) => {
      const spinner = ora('Fetching upcoming calendar events...').start();
      const client = new QuantCliClient();

      try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const numDays = Math.max(1, parseInt(options.days || '7', 10));
        const endOfWindow = new Date(startOfToday.getTime() + numDays * 24 * 60 * 60 * 1000);

        const queryParams = new URLSearchParams({
          start: startOfToday.toISOString(),
          end: endOfWindow.toISOString(),
        });

        let res: any;
        try {
          res = await client.get<any>(`/api/events?${queryParams.toString()}`);
        } catch {
          try {
            res = await client.get<any>(`/api/calendar/events?${queryParams.toString()}`);
          } catch {
            res = await client.get<any>(`/events?${queryParams.toString()}`);
          }
        }

        const rawEvents = res?.data || res?.events || (Array.isArray(res) ? res : []);
        const events: CalendarEventItem[] = Array.isArray(rawEvents) ? rawEvents : [];

        // Sort events chronologically
        events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        // Include all events in the requested window
        const filteredEvents = events;

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(filteredEvents, null, 2));
          return;
        }

        console.log(chalk.bold(`\n🗓️  QuantCalendar Agenda — Next ${numDays} Days`));
        console.log(
          chalk.gray(
            `   Window: ${formatEventDate(startOfToday)} -> ${formatEventDate(endOfWindow)}\n`,
          ),
        );

        if (filteredEvents.length === 0) {
          console.log(chalk.gray('  (no upcoming events scheduled in this period)\n'));
          return;
        }

        // Group events by YYYY-MM-DD
        const grouped = new Map<string, CalendarEventItem[]>();
        for (let dayOffset = 0; dayOffset < numDays; dayOffset++) {
          const currentDay = new Date(startOfToday.getTime() + dayOffset * 24 * 60 * 60 * 1000);
          grouped.set(toDateKey(currentDay), []);
        }

        for (const evt of filteredEvents) {
          const evtDate = new Date(evt.startTime);
          const key = toDateKey(evtDate);
          if (grouped.has(key)) {
            grouped.get(key)!.push(evt);
          } else {
            grouped.set(key, [evt]);
          }
        }

        const todayKey = toDateKey(now);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowKey = toDateKey(tomorrow);

        for (const [dayKey, dayEvents] of grouped.entries()) {
          const dateObj = new Date(`${dayKey}T00:00:00`);
          let dayTitle: string;

          if (dayKey === todayKey) {
            dayTitle = chalk.bold.yellow(`★ Today — ${formatEventDate(dateObj)}`);
          } else if (dayKey === tomorrowKey) {
            dayTitle = chalk.bold.cyan(`▶ Tomorrow — ${formatEventDate(dateObj)}`);
          } else {
            dayTitle = chalk.bold.white(`  ${formatEventDate(dateObj)}`);
          }

          console.log(dayTitle);

          if (dayEvents.length === 0) {
            console.log(chalk.gray('    No events scheduled'));
          } else {
            for (const evt of dayEvents) {
              const startStr = chalk.green(formatEventTime(evt.startTime));
              const endStr = chalk.cyan(formatEventTime(evt.endTime));
              const timeRange = evt.allDay
                ? chalk.bold.magenta('  [ALL DAY]  ')
                : `  ${startStr} - ${endStr}`;
              const titleStr = chalk.bold.white(evt.title || 'Untitled Event');

              let extraInfo = '';
              if (evt.location) {
                extraInfo += ` ${chalk.magenta(`📍 ${evt.location}`)}`;
              }
              if (evt.attendees && evt.attendees.length > 0) {
                extraInfo += ` ${chalk.gray(`👥 ${evt.attendees.length} attendee(s)`)}`;
              }
              if (evt.recurrenceRule) {
                extraInfo += ` ${chalk.blue('🔁 Recurring')}`;
              }

              console.log(`  • ${timeRange}  ${titleStr}${extraInfo}`);
              if (evt.description && evt.description.trim()) {
                const cleanDesc = evt.description.split('\n')[0]?.trim();
                if (cleanDesc) {
                  console.log(chalk.gray(`      ${cleanDesc}`));
                }
              }
            }
          }
          console.log('');
        }

        console.log(chalk.gray(`  Total: ${filteredEvents.length} event(s) found.\n`));
      } catch (err: any) {
        spinner.fail(chalk.red('Failed to fetch calendar agenda.'));
        console.error(chalk.red(`Error: ${err.message || 'Unable to load calendar events'}`));
        process.exitCode = 1;
      }
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // Subcommand: quant calendar book <slug>
  // ─────────────────────────────────────────────────────────────────────────────
  calendar
    .command('book <slug>')
    .description('Interactive slot booking via public booking link (/api/calendar/booking/:slug)')
    .option('-d, --date <date>', 'Booking date in YYYY-MM-DD format')
    .option('-s, --slot <slot>', 'Booking slot time (ISO string)')
    .option('-n, --name <name>', 'Attendee full name')
    .option('-e, --email <email>', 'Attendee email address')
    .option('-m, --notes <notes>', 'Additional notes or message for the host')
    .action(
      async (
        slug: string,
        options: { date?: string; slot?: string; name?: string; email?: string; notes?: string },
      ) => {
        const spinner = ora(`Fetching booking link details for "${slug}"...`).start();
        const client = new QuantCliClient();

        try {
          let bookingDetails: BookingLinkDetails;
          try {
            const res = await client.get<any>(`/api/calendar/booking/${encodeURIComponent(slug)}`);
            bookingDetails = res?.data || res;
          } catch {
            const res = await client.get<any>(`/calendar/booking/${encodeURIComponent(slug)}`);
            bookingDetails = res?.data || res;
          }

          spinner.stop();

          console.log(chalk.bold('\n📅 QuantCalendar Appointment Booking'));
          console.log(chalk.gray(`  Link:        ${chalk.cyan(slug)}`));
          console.log(
            chalk.gray(`  Title:       ${chalk.bold.white(bookingDetails.title || slug)}`),
          );
          console.log(
            chalk.gray(
              `  Duration:    ${chalk.yellow(`${bookingDetails.duration || 30} minutes`)}`,
            ),
          );
          if (bookingDetails.description) {
            console.log(chalk.gray(`  Description: ${bookingDetails.description}`));
          }
          if (bookingDetails.host?.name) {
            console.log(
              chalk.gray(
                `  Host:        ${bookingDetails.host.name} <${bookingDetails.host.email || ''}>`,
              ),
            );
          }
          console.log('');

          // Step 1: Select Date
          let selectedDate = options.date;
          if (!selectedDate) {
            const dateChoices: Array<{ name: string; value: string }> = [];
            const now = new Date();

            for (let i = 0; i < 7; i++) {
              const d = new Date(now.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
              const key = toDateKey(d);
              const label = i === 0 ? `Tomorrow (${formatEventDate(d)})` : formatEventDate(d);
              dateChoices.push({ name: label, value: key });
            }
            dateChoices.push({ name: 'Enter custom date (YYYY-MM-DD)', value: '__CUSTOM__' });

            const dateAnswer = await inquirer.prompt([
              {
                type: 'list',
                name: 'date',
                message: 'Select an appointment date:',
                choices: dateChoices,
              },
            ]);

            if (dateAnswer.date === '__CUSTOM__') {
              const customAnswer = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'customDate',
                  message: 'Enter date (YYYY-MM-DD):',
                  validate: (input: string) => {
                    return /^\d{4}-\d{2}-\d{2}$/.test(input.trim())
                      ? true
                      : 'Please enter date formatted as YYYY-MM-DD';
                  },
                },
              ]);
              selectedDate = customAnswer.customDate.trim();
            } else {
              selectedDate = dateAnswer.date;
            }
          }

          // Step 2: Fetch Available Slots for selected date
          const slotsSpinner = ora(`Fetching open time slots for ${selectedDate}...`).start();
          let slotsData: any;
          try {
            slotsData = await client.get<any>(
              `/api/calendar/booking/${encodeURIComponent(slug)}/slots?date=${encodeURIComponent(selectedDate!)}`,
            );
          } catch {
            slotsData = await client.get<any>(
              `/calendar/booking/${encodeURIComponent(slug)}/slots?date=${encodeURIComponent(selectedDate!)}`,
            );
          }

          const rawSlots = slotsData?.data || (Array.isArray(slotsData) ? slotsData : []);
          const availableSlots: string[] = (Array.isArray(rawSlots) ? rawSlots : [])
            .map((item: any) => (typeof item === 'string' ? item : item.slot || item.time))
            .filter(Boolean);

          slotsSpinner.stop();

          if (availableSlots.length === 0) {
            console.log(
              chalk.yellow(
                `\n⚠️  No open booking slots available for ${selectedDate}. Please select another date.\n`,
              ),
            );
            return;
          }

          // Step 3: Choose Slot
          let selectedSlot = options.slot;
          if (!selectedSlot) {
            const slotChoices = availableSlots.map((s) => {
              const startDate = new Date(s);
              const durationMs = (bookingDetails.duration || 30) * 60 * 1000;
              const endDate = new Date(startDate.getTime() + durationMs);
              return {
                name: `${formatEventTime(startDate)} - ${formatEventTime(endDate)} (${formatEventDate(startDate)})`,
                value: s,
              };
            });

            const slotAnswer = await inquirer.prompt([
              {
                type: 'list',
                name: 'slot',
                message: 'Select an available time slot:',
                choices: slotChoices,
              },
            ]);
            selectedSlot = slotAnswer.slot;
          }

          // Step 4: Gather Attendee Information
          const savedConfig = loadConfig();
          let attendeeName = options.name;
          let attendeeEmail = options.email;
          let attendeeNotes = options.notes;

          const infoQuestions: any[] = [];
          if (!attendeeName) {
            infoQuestions.push({
              type: 'input',
              name: 'name',
              message: 'Your Full Name:',
              default: savedConfig.user?.name || '',
              validate: (input: string) => (input.trim() ? true : 'Name is required'),
            });
          }
          if (!attendeeEmail) {
            infoQuestions.push({
              type: 'input',
              name: 'email',
              message: 'Your Email Address:',
              default: savedConfig.user?.email || '',
              validate: (input: string) => (input.includes('@') ? true : 'Valid email is required'),
            });
          }
          if (attendeeNotes === undefined) {
            infoQuestions.push({
              type: 'input',
              name: 'notes',
              message: 'Additional notes or meeting topic (optional):',
            });
          }

          if (infoQuestions.length > 0) {
            const infoAnswers = await inquirer.prompt(infoQuestions);
            attendeeName = attendeeName || infoAnswers.name;
            attendeeEmail = attendeeEmail || infoAnswers.email;
            attendeeNotes = attendeeNotes !== undefined ? attendeeNotes : infoAnswers.notes;
          }

          // Step 5: Lock Slot (Mutex Lock)
          const lockSpinner = ora('Locking chosen slot...').start();
          let lockId: string | undefined;

          try {
            const lockPayload = { slot: selectedSlot, email: attendeeEmail };
            let lockRes: any;
            try {
              lockRes = await client.post<any>(
                `/api/calendar/booking/${encodeURIComponent(slug)}/lock`,
                lockPayload,
              );
            } catch {
              lockRes = await client.post<any>(
                `/calendar/booking/${encodeURIComponent(slug)}/lock`,
                lockPayload,
              );
            }
            lockId = lockRes?.lockId || lockRes?.data?.lockId;
            lockSpinner.succeed(chalk.green('Slot reserved successfully.'));
          } catch (lockErr: any) {
            lockSpinner.warn(
              chalk.yellow(
                `Could not acquire slot lock (${lockErr.message || 'proceeding directly to confirmation'})`,
              ),
            );
          }

          // Step 6: Confirm Booking
          const confirmSpinner = ora('Submitting appointment booking...').start();
          const bookPayload = {
            slot: selectedSlot,
            name: attendeeName,
            email: attendeeEmail,
            notes: attendeeNotes || '',
            lockId: lockId || undefined,
          };

          let confirmation: any;
          try {
            confirmation = await client.post<any>(
              `/api/calendar/booking/${encodeURIComponent(slug)}/book`,
              bookPayload,
            );
          } catch {
            confirmation = await client.post<any>(
              `/calendar/booking/${encodeURIComponent(slug)}/book`,
              bookPayload,
            );
          }

          confirmSpinner.succeed(chalk.bold.green('✔ Appointment successfully booked!'));

          const confirmedData = confirmation?.data || confirmation;
          const eventStart = new Date(selectedSlot!);
          const eventDuration = bookingDetails.duration || 30;
          const eventEnd = new Date(eventStart.getTime() + eventDuration * 60 * 1000);

          console.log(chalk.bold('\n🎉 Booking Confirmation'));
          console.log(`  Event:       ${chalk.bold.white(bookingDetails.title || slug)}`);
          console.log(
            `  Date & Time: ${chalk.green(formatEventDate(eventStart))} from ${chalk.green(formatEventTime(eventStart))} to ${chalk.cyan(formatEventTime(eventEnd))}`,
          );
          console.log(`  Attendee:    ${chalk.white(attendeeName)} <${chalk.cyan(attendeeEmail)}>`);
          if (attendeeNotes) {
            console.log(`  Notes:       ${chalk.gray(attendeeNotes)}`);
          }
          if (confirmedData?.id) {
            console.log(`  Booking ID:  ${chalk.gray(confirmedData.id)}`);
          }
          console.log(chalk.gray(`  Confirmation sent to: ${chalk.cyan(attendeeEmail)}\n`));
        } catch (err: any) {
          spinner.fail(chalk.red('Booking failed.'));
          console.error(chalk.red(`Error: ${err.message || 'Unable to book appointment slot'}`));
          process.exitCode = 1;
        }
      },
    );
}
