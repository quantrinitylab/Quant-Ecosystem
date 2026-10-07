import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerStaffSchedule,
  registerService,
  isSlotAvailable,
  validateIntakeAnswers,
  clearStaffBookingForTesting,
  StaffSchedule,
  ServiceBookingConfig,
  ExistingAppointment,
  IntakeQuestion,
} from '../services/staff-booking-buffer.service';

describe('Staff Booking Buffer Service', () => {
  beforeEach(() => {
    clearStaffBookingForTesting();
  });

  const mockStaff: StaffSchedule = {
    staffId: 'staff-1',
    name: 'Alice',
    workingHours: { start: '09:00', end: '17:00' },
    breakWindows: [{ start: '13:00', end: '14:00' }],
    availableDays: [1, 2, 3, 4, 5], // Mon-Fri
  };

  const mockService: ServiceBookingConfig = {
    serviceId: 'srv-1',
    name: 'Consultation',
    durationMinutes: 60,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
  };

  it('registers staff schedule and working hours validation', () => {
    const registered = registerStaffSchedule(mockStaff);
    expect(registered.staffId).toBe('staff-1');
  });

  it('accepts slot within working hours and without conflicts', () => {
    registerStaffSchedule(mockStaff);
    registerService(mockService);

    // Monday 2026-09-28T10:00:00.000Z
    const slot = isSlotAvailable('staff-1', 'srv-1', '2026-09-28T10:00:00.000Z', []);
    expect(slot.available).toBe(true);
  });

  it('rejects slot during staff break', () => {
    registerStaffSchedule(mockStaff);
    registerService(mockService);

    const slot = isSlotAvailable('staff-1', 'srv-1', '2026-09-28T12:30:00.000Z', []);
    expect(slot.available).toBe(false);
    expect(slot.reason).toBe('Slot intersects with break window');
  });

  it('rejects slot colliding with pre- or post-service buffer of existing booking', () => {
    registerStaffSchedule(mockStaff);
    registerService(mockService);

    const existingAppt: ExistingAppointment = {
      appointmentId: 'appt-1',
      staffId: 'staff-1',
      startTime: '2026-09-28T10:00:00.000Z',
      endTime: '2026-09-28T11:00:00.000Z',
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    };

    // New slot starts at 11:00. Appt 1 ends at 11:00 but has 15m after buffer, so blocks until 11:15.
    // New slot starts at 11:00 but has 15m before buffer, so its buffer starts at 10:45.
    // 10:45 < 11:15 => overlap!
    const slot1 = isSlotAvailable('staff-1', 'srv-1', '2026-09-28T11:00:00.000Z', [existingAppt]);
    expect(slot1.available).toBe(false);
    expect(slot1.reason).toBe('Slot collides with an existing appointment');

    // Safe slot starts at 11:30. Its pre-buffer is 11:15. So 11:15 >= 11:15, which doesn't intersect strictly.
    const slot2 = isSlotAvailable('staff-1', 'srv-1', '2026-09-28T11:30:00.000Z', [existingAppt]);
    expect(slot2.available).toBe(true);
  });

  it('validates intake questions correctly', () => {
    const questions: IntakeQuestion[] = [
      { id: 'q1', label: 'Name', type: 'text', required: true },
      { id: 'q2', label: 'Age', type: 'number', required: false },
      { id: 'q3', label: 'Plan', type: 'select', required: true, options: ['A', 'B'] },
    ];

    const result1 = validateIntakeAnswers(questions, { q1: 'John', q3: 'A' });
    expect(result1.valid).toBe(true);

    const result2 = validateIntakeAnswers(questions, { q1: '', q3: 'C' });
    expect(result2.valid).toBe(false);
    expect(result2.errors['q1']).toBeDefined();
    expect(result2.errors['q3']).toBeDefined();
  });
});
