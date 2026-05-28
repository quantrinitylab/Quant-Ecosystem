import { describe, it, expect } from 'vitest';
import { EmergencyAccessManager } from '../phone-free/emergency-access.js';
import type { EmergencyContact } from '../phone-free/types.js';

const contacts: EmergencyContact[] = [
  { id: '1', name: 'Mom', phone: '+15551111111', relationship: 'parent' },
  { id: '2', name: 'Dad', phone: '+15552222222', relationship: 'parent' },
];

describe('EmergencyAccessManager', () => {
  it('throws if constructed with empty contacts', () => {
    expect(() => new EmergencyAccessManager([])).toThrow(
      'EmergencyAccessManager requires at least one contact',
    );
  });

  it('accepts a custom panic phrase', () => {
    const mgr = new EmergencyAccessManager(contacts, 'help me');
    expect(mgr.handlePanicPhrase('help me')).toEqual(contacts[0]);
    expect(mgr.handlePanicPhrase('Quant, emergency')).toBeNull();
  });

  it('is always available', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.available).toBe(true);
  });

  it('cannot be disabled', () => {
    const mgr = new EmergencyAccessManager(contacts);
    // No disable method exists; available is always true
    expect(mgr.available).toBe(true);
    expect((mgr as any).disable).toBeUndefined();
  });

  it('callEmergency returns first contact by default', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.callEmergency()).toEqual(contacts[0]);
  });

  it('callEmergency returns specific contact by id', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.callEmergency('2')).toEqual(contacts[1]);
  });

  it('callEmergency falls back to first contact for unknown id', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.callEmergency('unknown')).toEqual(contacts[0]);
  });

  it('handles panic phrase correctly', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.handlePanicPhrase('Quant, emergency')).toEqual(contacts[0]);
    expect(mgr.handlePanicPhrase('quant, emergency')).toEqual(contacts[0]);
    expect(mgr.handlePanicPhrase('hello')).toBeNull();
  });

  it('crashDetected returns first contact', () => {
    const mgr = new EmergencyAccessManager(contacts);
    expect(mgr.crashDetected()).toEqual(contacts[0]);
  });
});
