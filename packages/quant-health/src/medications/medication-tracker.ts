import { MedicationReminder } from '../types.js';

export class MedicationTracker {
  private medications: Map<string, MedicationReminder> = new Map();
  private doses: Map<string, number[]> = new Map();

  private static readonly INTERACTIONS: [string, string][] = [
    ['blood thinner', 'aspirin'],
    ['ssri', 'maoi'],
    ['metformin', 'alcohol'],
  ];

  addMedication(med: MedicationReminder): void {
    this.medications.set(med.id, med);
    if (!this.doses.has(med.id)) this.doses.set(med.id, []);
  }

  removeMedication(id: string): boolean {
    this.doses.delete(id);
    return this.medications.delete(id);
  }

  getReminders(currentTime: number): MedicationReminder[] {
    const due: MedicationReminder[] = [];
    for (const med of this.medications.values()) {
      if (med.nextDue <= currentTime) due.push(med);
    }
    return due;
  }

  recordDose(medId: string, timestamp: number): boolean {
    if (!this.medications.has(medId)) return false;
    const record = this.doses.get(medId);
    if (record) record.push(timestamp);
    return true;
  }

  getAdherence(medId: string, currentTime = Date.now()): number {
    const med = this.medications.get(medId);
    if (!med) return 0;
    if (med.frequency === 'as_needed') return 100;
    const record = this.doses.get(medId);
    if (!record || record.length === 0) return 0;
    const days = Math.max(1, Math.ceil((currentTime - record[0]!) / 86400000));
    let expected: number;
    if (med.frequency === 'twice_daily') {
      expected = days * 2;
    } else if (med.frequency === 'weekly') {
      expected = Math.max(1, Math.floor(days / 7));
    } else {
      expected = days;
    }
    return Math.min(Math.round((record.length / expected) * 100), 100);
  }

  /**
   * Placeholder interaction check for MVP demo purposes.
   * Uses naive substring matching on only three hardcoded pairs.
   * A production implementation would use structured medication identifiers
   * (e.g., RxNorm codes) and a comprehensive interaction database.
   */
  checkInteractions(medNames: string[]): string[] {
    const warnings: string[] = [];
    const lower = medNames.map((n) => n.toLowerCase());
    for (const [a, b] of MedicationTracker.INTERACTIONS) {
      const hasA = lower.some((n) => n.includes(a));
      const hasB = lower.some((n) => n.includes(b));
      if (hasA && hasB) {
        warnings.push(`Potential interaction between ${a} and ${b}. Consult your doctor.`);
      }
    }
    return warnings;
  }
}
