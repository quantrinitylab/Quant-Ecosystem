// ============================================================================
// QM-QUANTY-003 — Voice-to-mail workflow service tests
//
// Covers: entity parsing (Hinglish), recipient resolution scoring,
// risk assessment, restatement building, sent-state verification.
// No network, no mocks of the units under test — pure logic.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  parseVoiceMailCommand,
  resolveRecipient,
  assessVoiceMailRisk,
  buildRestatement,
  prepareVoiceMail,
  verifySentState,
  type ContactCandidate,
} from '../services/voice-mail-workflow.service';

const CONTACTS: ContactCandidate[] = [
  { id: 'c1', name: 'Rahul Sharma', email: 'rahul.sharma@example.com' },
  { id: 'c2', name: 'Rahul Verma', email: 'rahul.verma@example.com' },
  { id: 'c3', name: 'Priya Singh', email: 'priya@company.in' },
];

describe('parseVoiceMailCommand', () => {
  it('parses the canonical Hinglish example: "Rahul ko email likho aur bhejo"', () => {
    const e = parseVoiceMailCommand('Quanty, Rahul ko email likho aur bhejo', 0.9);
    expect(e.recipientName).toBe('Rahul');
    expect(e.recipientEmail).toBeNull();
    expect(e.entityConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it('extracts an explicit email address with highest confidence', () => {
    const e = parseVoiceMailCommand('send email to rahul@example.com about the meeting', 0.9);
    expect(e.recipientEmail).toBe('rahul@example.com');
    // 0.95 base for explicit email, minus subject/body penalties (none found).
    expect(e.entityConfidence).toBeGreaterThanOrEqual(0.7);
    expect(e.entityConfidence).toBeLessThanOrEqual(0.95);
  });

  it('extracts an explicit subject marker', () => {
    const e = parseVoiceMailCommand('Rahul ko email likho subject: kal ki meeting', 0.9);
    expect(e.subject).toContain('kal ki meeting');
  });

  it('penalizes low ASR confidence', () => {
    const high = parseVoiceMailCommand('Rahul ko email bhejo', 0.95);
    const low = parseVoiceMailCommand('Rahul ko email bhejo', 0.3);
    expect(low.entityConfidence).toBeLessThan(high.entityConfidence);
    expect(low.parseNotes.some((n) => n.includes('ASR'))).toBe(true);
  });

  it('reports no-recipient with low confidence and a note', () => {
    const e = parseVoiceMailCommand('hello how are you', 0.9);
    expect(e.recipientName).toBeNull();
    expect(e.entityConfidence).toBeLessThan(0.5);
    expect(e.parseNotes.length).toBeGreaterThan(0);
  });

  it('never returns confidence outside [0, 1]', () => {
    const e = parseVoiceMailCommand('x', null);
    expect(e.entityConfidence).toBeGreaterThanOrEqual(0);
    expect(e.entityConfidence).toBeLessThanOrEqual(1);
  });
});

describe('resolveRecipient', () => {
  it('resolves an exact email hit with near-1 confidence', () => {
    const r = resolveRecipient('rahul.sharma@example.com', CONTACTS);
    expect(r.status).toBe('resolved');
    expect(r.email).toBe('rahul.sharma@example.com');
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('marks two Rahuls as ambiguous (not silently picking one)', () => {
    const r = resolveRecipient('Rahul', CONTACTS);
    expect(r.status).toBe('ambiguous');
    expect(r.email).toBeNull();
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves a unique name with high confidence', () => {
    const r = resolveRecipient('Priya Singh', CONTACTS);
    expect(r.status).toBe('resolved');
    expect(r.email).toBe('priya@company.in');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('returns not_found for unknown names with null confidence', () => {
    const r = resolveRecipient('Zyxwvu', CONTACTS);
    expect(r.status).toBe('not_found');
    expect(r.confidence).toBeNull();
  });

  it('accepts a raw external email at reduced confidence', () => {
    const r = resolveRecipient('stranger@external.com', CONTACTS);
    expect(r.status).toBe('resolved');
    expect(r.email).toBe('stranger@external.com');
    expect(r.confidence).toBeLessThan(0.9);
  });
});

describe('assessVoiceMailRisk', () => {
  it('always tiers external send at 3 (Sentinel confirmation)', () => {
    const r = resolveRecipient('Priya Singh', CONTACTS);
    const risk = assessVoiceMailRisk(r, 0.9, 0.9, 'company.in');
    expect(risk.tier).toBe(3);
    expect(risk.reasons.length).toBeGreaterThan(0);
  });

  it('flags external domains', () => {
    const r = resolveRecipient('stranger@external.com', CONTACTS);
    const risk = assessVoiceMailRisk(r, 0.9, 0.9, 'company.in');
    expect(risk.reasons.some((x) => x.includes('External'))).toBe(true);
  });

  it('flags low entity confidence', () => {
    const r = resolveRecipient('Priya Singh', CONTACTS);
    const risk = assessVoiceMailRisk(r, 0.3, 0.9);
    expect(risk.reasons.some((x) => x.includes('entity confidence'))).toBe(true);
  });
});

describe('buildRestatement', () => {
  it('restates critical entities for user review', () => {
    const prepared = prepareVoiceMail('Priya ko email bhejo subject: hello', 0.9, CONTACTS);
    expect(prepared.restatement.to).toContain('priya@company.in');
    expect(prepared.restatement.subject).toContain('hello');
  });

  it('warns on ambiguity instead of hiding it', () => {
    const prepared = prepareVoiceMail('Rahul ko email bhejo', 0.9, CONTACTS);
    expect(prepared.restatement.warnings.some((w) => w.includes('Multiple contacts'))).toBe(true);
    expect(prepared.canProceed).toBe(false);
    expect(prepared.blockers.length).toBeGreaterThan(0);
  });
});

describe('prepareVoiceMail', () => {
  it('proceeds when recipient resolves uniquely', () => {
    const p = prepareVoiceMail(
      'Priya Singh ko email likho subject: update body: kaam ho gaya',
      0.92,
      CONTACTS,
      'company.in',
    );
    expect(p.canProceed).toBe(true);
    expect(p.recipient.status).toBe('resolved');
    expect(p.risk.tier).toBe(3);
  });

  it('blocks when nothing can be sent', () => {
    const p = prepareVoiceMail('hello', 0.9, CONTACTS);
    expect(p.canProceed).toBe(false);
  });

  it('keeps the three confidences separate', () => {
    const p = prepareVoiceMail('Priya ko email bhejo', 0.77, CONTACTS);
    expect(p.asrConfidence).toBe(0.77);
    expect(typeof p.entities.entityConfidence).toBe('number');
    expect(typeof p.recipient.confidence === 'number' || p.recipient.confidence === null).toBe(true);
  });
});

describe('verifySentState', () => {
  it('reports sent for delivered deliveryStatus', () => {
    const v = verifySentState('e1', { isSent: true, deliveryStatus: 'delivered' });
    expect(v.status).toBe('sent');
    expect(v.deliveryStatus).toBe('delivered');
    expect(v.verifiedAt).toBeTruthy();
  });

  it('reports queued for queued deliveryStatus (async send)', () => {
    const v = verifySentState('e1', { isSent: false, deliveryStatus: 'queued' });
    expect(v.status).toBe('queued');
  });

  it('reports failed for failed deliveryStatus', () => {
    const v = verifySentState('e1', { isSent: false, deliveryStatus: 'failed' });
    expect(v.status).toBe('failed');
  });

  it('never invents sent state when the record is missing', () => {
    const v = verifySentState('e1', null);
    expect(v.status).toBe('unknown');
    expect(v.deliveryStatus).toBeNull();
  });
});
