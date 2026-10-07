import { CodeAuditLog, MergeGate } from '../safety/code-audit.js';

describe('CodeAuditLog', () => {
  let log: CodeAuditLog;
  beforeEach(() => {
    log = new CodeAuditLog();
  });

  it('adds and retrieves entries', () => {
    log.addEntry('edit', 'changed file.ts', { filesChanged: ['file.ts'] });
    expect(log.getEntries()).toHaveLength(1);
    expect(log.getEntries()[0]?.action).toBe('edit');
  });

  it('calculates total token spend', () => {
    log.addEntry('gen', 'code gen', { tokenCost: 500 });
    log.addEntry('review', 'reviewed', { tokenCost: 200 });
    expect(log.getTokenSpend()).toBe(700);
  });

  it('assigns unique ids', () => {
    log.addEntry('a', 'x');
    log.addEntry('b', 'y');
    const ids = log.getEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('MergeGate', () => {
  it('requires signoff by default', () => {
    const gate = new MergeGate();
    expect(gate.isApproved('t1')).toBe(false);
    gate.approve('t1', 'alice');
    expect(gate.isApproved('t1')).toBe(true);
  });

  it('auto-approves when signoff disabled', () => {
    const gate = new MergeGate(false);
    expect(gate.isApproved('t1')).toBe(true);
  });
});
