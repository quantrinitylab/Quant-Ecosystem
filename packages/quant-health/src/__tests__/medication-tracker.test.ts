import { MedicationTracker } from '../medications/medication-tracker.js';
import { MedicationReminder } from '../types.js';

function makeMed(overrides: Partial<MedicationReminder> = {}): MedicationReminder {
  return {
    id: 'med-1',
    name: 'Aspirin',
    dosage: '100mg',
    frequency: 'daily',
    times: ['08:00'],
    nextDue: Date.now() - 1000,
    adherenceRate: 90,
    interactions: [],
    ...overrides,
  };
}

describe('MedicationTracker', () => {
  let tracker: MedicationTracker;

  beforeEach(() => {
    tracker = new MedicationTracker();
  });

  it('should add and remove medications', () => {
    tracker.addMedication(makeMed());
    expect(tracker.removeMedication('med-1')).toBe(true);
    expect(tracker.removeMedication('med-1')).toBe(false);
  });

  it('should return reminders for due medications', () => {
    const now = Date.now();
    tracker.addMedication(makeMed({ id: 'a', nextDue: now - 5000 }));
    tracker.addMedication(makeMed({ id: 'b', nextDue: now + 999999 }));

    const reminders = tracker.getReminders(now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.id).toBe('a');
  });

  it('should record dose and track adherence', () => {
    tracker.addMedication(makeMed({ id: 'med-1' }));
    const doseTime = Date.now();
    const result = tracker.recordDose('med-1', doseTime);
    expect(result).toBe(true);

    // Pass currentTime explicitly for deterministic testing
    const adherence = tracker.getAdherence('med-1', doseTime + 86400000);
    expect(adherence).toBeGreaterThan(0);
  });

  it('should return false for recording dose on unknown medication', () => {
    expect(tracker.recordDose('unknown', Date.now())).toBe(false);
  });

  it('should detect known drug interactions', () => {
    const warnings = tracker.checkInteractions(['Blood Thinner', 'Aspirin']);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('blood thinner');
    expect(warnings[0]).toContain('aspirin');
  });

  it('should detect SSRI + MAOI interaction', () => {
    const warnings = tracker.checkInteractions(['SSRI medication', 'MAOI inhibitor']);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should return no warnings for non-interacting meds', () => {
    const warnings = tracker.checkInteractions(['Vitamin D', 'Calcium']);
    expect(warnings).toHaveLength(0);
  });

  it('should return 100 adherence for as_needed medications', () => {
    tracker.addMedication(makeMed({ id: 'prn-1', frequency: 'as_needed' }));
    const adherence = tracker.getAdherence('prn-1');
    expect(adherence).toBe(100);
  });

  it('should compute adherence correctly for weekly medications', () => {
    const startTime = 1000000;
    tracker.addMedication(makeMed({ id: 'weekly-1', frequency: 'weekly' }));
    // Record 1 dose at start
    tracker.recordDose('weekly-1', startTime);
    // After 7 days, expected = 1, taken = 1 -> 100%
    const adherence = tracker.getAdherence('weekly-1', startTime + 7 * 86400000);
    expect(adherence).toBe(100);
  });

  it('should not inflate adherence for weekly meds over short periods', () => {
    const startTime = 1000000;
    tracker.addMedication(makeMed({ id: 'weekly-2', frequency: 'weekly' }));
    // Record 1 dose
    tracker.recordDose('weekly-2', startTime);
    // After 14 days, expected = 2, taken = 1 -> 50%
    const adherence = tracker.getAdherence('weekly-2', startTime + 14 * 86400000);
    expect(adherence).toBe(50);
  });
});
