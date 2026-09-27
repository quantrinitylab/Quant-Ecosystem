export interface StaffSchedule {
  staffId: string;
  name: string;
  workingHours: {
    start: string; // HH:mm e.g. "09:00"
    end: string; // HH:mm e.g. "17:00"
  };
  breakWindows: Array<{ start: string; end: string }>; // HH:mm
  availableDays: number[]; // 0=Sun, 1=Mon ... 6=Sat
}

export interface ServiceBookingConfig {
  serviceId: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface ExistingAppointment {
  appointmentId: string;
  staffId: string;
  startTime: string; // ISO date-time
  endTime: string; // ISO date-time
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface IntakeQuestion {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  required: boolean;
  options?: string[]; // for select
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const staffSchedules = new Map<string, StaffSchedule>();
const serviceConfigs = new Map<string, ServiceBookingConfig>();

export function registerStaffSchedule(schedule: StaffSchedule): StaffSchedule {
  staffSchedules.set(schedule.staffId, schedule);
  return schedule;
}

export function registerService(service: ServiceBookingConfig): ServiceBookingConfig {
  serviceConfigs.set(service.serviceId, service);
  return service;
}

function parseHHmm(timeStr: string): number {
  const [hh, mm] = timeStr.split(':').map(Number);
  return hh * 60 + mm;
}

export function isSlotAvailable(
  staffId: string,
  serviceId: string,
  proposedStartTimeIso: string,
  existingAppointments: ExistingAppointment[],
): { available: boolean; reason?: string } {
  const staff = staffSchedules.get(staffId);
  if (!staff) {
    return { available: false, reason: 'Staff not found' };
  }
  const service = serviceConfigs.get(serviceId);
  if (!service) {
    return { available: false, reason: 'Service not found' };
  }

  const startDate = new Date(proposedStartTimeIso);
  if (isNaN(startDate.getTime())) {
    return { available: false, reason: 'Invalid proposed start time' };
  }

  const dayOfWeek = startDate.getUTCDay();
  if (!staff.availableDays.includes(dayOfWeek)) {
    return { available: false, reason: 'Staff not available on this day' };
  }

  const startHH = startDate.getUTCHours();
  const startMM = startDate.getUTCMinutes();
  const startMins = startHH * 60 + startMM;
  const endMins = startMins + service.durationMinutes;

  const workStartMins = parseHHmm(staff.workingHours.start);
  const workEndMins = parseHHmm(staff.workingHours.end);

  if (startMins < workStartMins || endMins > workEndMins) {
    return { available: false, reason: 'Slot falls outside working hours' };
  }

  for (const brk of staff.breakWindows) {
    const brkStartMins = parseHHmm(brk.start);
    const brkEndMins = parseHHmm(brk.end);
    if (Math.max(startMins, brkStartMins) < Math.min(endMins, brkEndMins)) {
      return { available: false, reason: 'Slot intersects with break window' };
    }
  }

  const proposedStartMs = startDate.getTime();
  const proposedEndMs = proposedStartMs + service.durationMinutes * 60000;

  const proposedBufferedStartMs = proposedStartMs - service.bufferBeforeMinutes * 60000;
  const proposedBufferedEndMs = proposedEndMs + service.bufferAfterMinutes * 60000;

  for (const appt of existingAppointments) {
    if (appt.staffId !== staffId) continue;

    const apptStartMs = new Date(appt.startTime).getTime();
    const apptEndMs = new Date(appt.endTime).getTime();

    const apptBufferedStartMs = apptStartMs - appt.bufferBeforeMinutes * 60000;
    const apptBufferedEndMs = apptEndMs + appt.bufferAfterMinutes * 60000;

    if (
      Math.max(proposedBufferedStartMs, apptBufferedStartMs) <
      Math.min(proposedBufferedEndMs, apptBufferedEndMs)
    ) {
      return { available: false, reason: 'Slot collides with an existing appointment' };
    }
  }

  return { available: true };
}

export function validateIntakeAnswers(
  questions: IntakeQuestion[],
  answers: Record<string, any>,
): IntakeValidationResult {
  const errors: Record<string, string> = {};

  for (const q of questions) {
    const val = answers[q.id];

    if (val === undefined || val === null || val === '') {
      if (q.required) {
        errors[q.id] = `Field ${q.label} is required`;
      }
      continue;
    }

    if (q.type === 'number') {
      if (typeof val !== 'number' || !isFinite(val)) {
        errors[q.id] = `Field ${q.label} must be a valid number`;
      }
    } else if (q.type === 'boolean') {
      if (typeof val !== 'boolean') {
        errors[q.id] = `Field ${q.label} must be a boolean`;
      }
    } else if (q.type === 'select') {
      if (q.options && !q.options.includes(val)) {
        errors[q.id] = `Field ${q.label} must be one of the allowed options`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function clearStaffBookingForTesting(): void {
  staffSchedules.clear();
  serviceConfigs.clear();
}
