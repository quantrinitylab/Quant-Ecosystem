// ============================================================================
// QuantMail — call-reminder → notification-center wiring (QM-SCREEN-015).
//
// The audit finding: `AlarmService.getDueCallAlarms` computes due call-alarms
// in pure code, but nothing persisted them as notification rows and nothing
// delivered them — GET /events/alarms/due had zero frontend consumers, so
// reminders silently never reached anyone.
//
// This service closes the loop. Bounded to backend work only: no new UI
// surfaces, no new user settings.
//
//   compute   the existing AlarmService over the user's events inside the
//             alarm fetch window (the same window the /events/alarms/due
//             route queries)
//   persist   one Notification row per due alarm, type `call_reminder`,
//             always userId-scoped, idempotent on
//             (userId, type, sourceEntityId = "<eventId>:<fireAt>")
//   deliver   deliverPushToUser (QM-UIUX-053) for every newly created row,
//             with the honest outcome logged and never thrown — push must
//             never fail the notification row, and nothing is ever reported
//             as delivered that was not.
//
// Two entry points:
//   persistDueCallReminders(deps, userId, now) — one user; called from the
//     existing GET /events/alarms/due route so that endpoint's computation
//     now lands in the notification center instead of dying in the response.
//   sweepDueCallReminders(deps, now) — all users; run on a periodic timer
//     (registered in backend/app.ts) so reminders fire even when nothing
//     polls the route.
//
// The persisted rows render in the existing /notifications center list with
// no special-casing: the center lists every notification row regardless of
// type, and `call_reminder` carries only real event data in title/body/data.
// ============================================================================

import { AlarmService, type AlarmEvent, type DueAlarm } from './alarm.service';
import {
  deliverPushToUser,
  type PushDeliveryDeps,
  type PushDeliveryOutcome,
} from './push-delivery.service';
import type { WebPushPayload } from '@quant/notifications';

/** Notification.type value for call-reminder rows. The column is a plain string. */
export const CALL_REMINDER_TYPE = 'call_reminder';

/** Upper bound on events scanned per sweep so one tick cannot walk the table. */
export const CALL_REMINDER_SWEEP_MAX_EVENTS = 1000;

export interface CallReminderEventRow {
  id: string;
  userId: string;
  title: string;
  startTime: Date | string;
  status: string | null;
  reminders: unknown;
}

export interface CallReminderEventStore {
  findMany(args: {
    where: {
      userId?: string;
      startTime: { lt: Date };
      endTime: { gt: Date };
    };
    orderBy: { startTime: 'asc' };
    take?: number;
  }): Promise<CallReminderEventRow[]>;
}

export interface CallReminderNotificationStore {
  findFirst(args: {
    where: { userId: string; type: string; sourceEntityId: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

/** Single-string calls — satisfied by Fastify's pino logger and trivial fakes. */
export interface CallReminderLog {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface CallReminderNotifyDeps {
  events: CallReminderEventStore;
  notifications: CallReminderNotificationStore;
  /** Passed through to deliverPushToUser. Omit vapid/sendHandler in production (env-derived). */
  push: Pick<PushDeliveryDeps, 'store' | 'vapid' | 'sendHandler'>;
  log?: CallReminderLog;
  /** Alarm ring window; defaults to AlarmService's own default. */
  ringWindowSec?: number;
}

export interface CallReminderPersistResult {
  due: DueAlarm[];
  persisted: number;
  skippedExisting: number;
  push: PushDeliveryOutcome[];
}

export interface CallReminderSweepResult {
  users: number;
  due: number;
  persisted: number;
  skippedExisting: number;
  truncated: boolean;
}

/**
 * The calendar route stores reminders as a JSON array of
 * { type, minutesBefore } (sometimes a JSON string). Same normalization as
 * routes/calendar.ts's alarmReminders — kept local so the service does not
 * depend on a route module.
 */
function parseReminders(raw: unknown): AlarmEvent['reminders'] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const result: AlarmEvent['reminders'] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const reminder = entry as { type?: unknown; minutesBefore?: unknown };
    const minutesBefore = Number(reminder.minutesBefore);
    if (typeof reminder.type === 'string' && Number.isFinite(minutesBefore)) {
      result.push({ type: reminder.type, minutesBefore });
    }
  }
  return result;
}

function toAlarmEvent(row: CallReminderEventRow): AlarmEvent {
  return {
    id: row.id,
    title: row.title,
    startTime: row.startTime instanceof Date ? row.startTime : new Date(row.startTime),
    status: row.status ?? '',
    reminders: parseReminders(row.reminders),
  };
}

/** Only real data — the event's own title and the computed time until start. */
function reminderTitle(eventTitle: string): string {
  return `Call reminder: ${eventTitle}`;
}

function reminderBody(minutesUntilStart: number): string {
  if (minutesUntilStart <= 0) return 'Starting now';
  return `Starts in ${minutesUntilStart} minute${minutesUntilStart === 1 ? '' : 's'}`;
}

async function persistAndDeliverOne(
  deps: CallReminderNotifyDeps,
  userId: string,
  alarm: DueAlarm,
  push: PushDeliveryOutcome[],
): Promise<{ persisted: boolean; skippedExisting: boolean }> {
  const sourceEntityId = `${alarm.eventId}:${alarm.fireAt}`;
  const existing = await deps.notifications.findFirst({
    where: { userId, type: CALL_REMINDER_TYPE, sourceEntityId },
    select: { id: true },
  });
  if (existing) {
    return { persisted: false, skippedExisting: true };
  }

  const title = reminderTitle(alarm.title);
  const body = reminderBody(alarm.minutesUntilStart);
  const actionUrl = '/calendar';
  await deps.notifications.create({
    data: {
      userId,
      type: CALL_REMINDER_TYPE,
      title,
      body,
      sourceApp: 'quantmail',
      sourceEntityId,
      actionUrl,
      data: {
        eventId: alarm.eventId,
        fireAt: alarm.fireAt,
        startTime: alarm.startTime,
        minutesUntilStart: alarm.minutesUntilStart,
      },
    },
  });

  // QM-UIUX-053: the same event, pushed to the user's registered browsers.
  // Contained like the mail path: a push failure never un-persists the row
  // and never throws — the outcome is logged with its real status.
  try {
    const payload: WebPushPayload = {
      title,
      body,
      tag: `call-reminder:${alarm.eventId}:${alarm.fireAt}`,
      data: { url: actionUrl, eventId: alarm.eventId, fireAt: alarm.fireAt },
    };
    const outcome = await deliverPushToUser(deps.push, userId, payload);
    push.push(outcome);
    deps.log?.info(
      `[call-reminder] push outcome for event ${alarm.eventId}: ${outcome.status} ` +
        `(delivered=${outcome.delivered} failed=${outcome.failed} pruned=${outcome.pruned})`,
    );
  } catch (error) {
    deps.log?.error(
      `[call-reminder] push failed for event ${alarm.eventId} — row already persisted: ${String(error)}`,
    );
  }
  return { persisted: true, skippedExisting: false };
}

/**
 * Compute due call-alarms for one user, persist notification rows for them,
 * and push. Returns the due alarms (so the existing /events/alarms/due
 * route keeps its response contract) plus persistence/push bookkeeping.
 * Never throws for notification/push problems — those are contained per
 * alarm; a database failure on the event query still propagates.
 */
export async function persistDueCallReminders(
  deps: CallReminderNotifyDeps,
  userId: string,
  now: Date = new Date(),
): Promise<CallReminderPersistResult> {
  const alarms = new AlarmService(deps.ringWindowSec);
  const { start, end } = alarms.fetchWindow(now);
  const rows = await deps.events.findMany({
    where: { userId, startTime: { lt: end }, endTime: { gt: start } },
    orderBy: { startTime: 'asc' },
  });
  const due = alarms.getDueCallAlarms(rows.map(toAlarmEvent), now);

  const push: PushDeliveryOutcome[] = [];
  let persisted = 0;
  let skippedExisting = 0;
  for (const alarm of due) {
    try {
      const result = await persistAndDeliverOne(deps, userId, alarm, push);
      if (result.persisted) persisted += 1;
      if (result.skippedExisting) skippedExisting += 1;
    } catch (error) {
      // One bad alarm must not cancel the rest — the row-level failure is
      // logged with the real error, exactly like the inbound mail path.
      deps.log?.error(`[call-reminder] persist failed for event ${alarm.eventId}: ${String(error)}`);
    }
  }
  return { due, persisted, skippedExisting, push };
}

/**
 * All-user sweep for the periodic timer. Groups the window's events by
 * userId and runs the single-user path per user. Bounded by
 * CALL_REMINDER_SWEEP_MAX_EVENTS; sets `truncated` (and logs) when the
 * window held more events than were scanned.
 */
export async function sweepDueCallReminders(
  deps: CallReminderNotifyDeps,
  now: Date = new Date(),
): Promise<CallReminderSweepResult> {
  const alarms = new AlarmService(deps.ringWindowSec);
  const { start, end } = alarms.fetchWindow(now);
  const rows = await deps.events.findMany({
    where: { startTime: { lt: end }, endTime: { gt: start } },
    orderBy: { startTime: 'asc' },
    take: CALL_REMINDER_SWEEP_MAX_EVENTS,
  });
  const truncated = rows.length >= CALL_REMINDER_SWEEP_MAX_EVENTS;
  if (truncated) {
    deps.log?.warn(
      `[call-reminder] sweep truncated at ${CALL_REMINDER_SWEEP_MAX_EVENTS} events — some due reminders may be delayed to the next tick`,
    );
  }

  const byUser = new Map<string, CallReminderEventRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  let due = 0;
  let persisted = 0;
  let skippedExisting = 0;
  for (const [userId, userRows] of byUser) {
    const userDue = alarms.getDueCallAlarms(userRows.map(toAlarmEvent), now);
    due += userDue.length;
    const push: PushDeliveryOutcome[] = [];
    for (const alarm of userDue) {
      try {
        const result = await persistAndDeliverOne(deps, userId, alarm, push);
        if (result.persisted) persisted += 1;
        if (result.skippedExisting) skippedExisting += 1;
      } catch (error) {
        deps.log?.error(`[call-reminder] sweep persist failed for event ${alarm.eventId}: ${String(error)}`);
      }
    }
  }
  return { users: byUser.size, due, persisted, skippedExisting, truncated };
}
