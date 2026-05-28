import type { EmergencyContact } from './types.js';

export class EmergencyAccessManager {
  private contacts: EmergencyContact[];
  private readonly panicPhrase: string;

  constructor(contacts: EmergencyContact[], panicPhrase?: string) {
    if (contacts.length === 0) {
      throw new Error('EmergencyAccessManager requires at least one contact');
    }
    this.contacts = contacts;
    this.panicPhrase = panicPhrase ?? 'Quant, emergency';
  }

  /** Emergency access is always available - cannot be disabled */
  get available(): boolean {
    return true;
  }

  callEmergency(contactId?: string): EmergencyContact {
    if (contactId) {
      const c = this.contacts.find((x) => x.id === contactId);
      if (c) return c;
    }
    return this.contacts[0]!;
  }

  handlePanicPhrase(phrase: string): EmergencyContact | null {
    if (phrase.toLowerCase() === this.panicPhrase.toLowerCase()) {
      return this.contacts[0] ?? null;
    }
    return null;
  }

  crashDetected(): EmergencyContact {
    return this.contacts[0]!;
  }

  getContacts(): EmergencyContact[] {
    return [...this.contacts];
  }
}
