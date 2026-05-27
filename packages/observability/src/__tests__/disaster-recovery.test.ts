import { describe, it, expect } from 'vitest';
import { DisasterRecovery } from '../disaster-recovery.js';

describe('DisasterRecovery', () => {
  it('creates backup schedule based on RPO', () => {
    const dr = new DisasterRecovery();
    const schedule = dr.createBackupSchedule('quantmail', 15);

    expect(schedule.service).toBe('quantmail');
    expect(schedule.rpo).toBe(15);
    expect(schedule.frequency).toBe('every_15m');
    expect(schedule.type).toBe('incremental');
    expect(schedule.retentionDays).toBe(7);
  });

  it('creates hourly backups for 60min RPO', () => {
    const dr = new DisasterRecovery();
    const schedule = dr.createBackupSchedule('quantdocs', 60);

    expect(schedule.frequency).toBe('hourly');
    expect(schedule.type).toBe('differential');
    expect(schedule.retentionDays).toBe(14);
  });

  it('creates daily backups for large RPO', () => {
    const dr = new DisasterRecovery();
    const schedule = dr.createBackupSchedule('quantads', 1440);

    expect(schedule.frequency).toBe('daily');
    expect(schedule.type).toBe('full');
    expect(schedule.retentionDays).toBe(90);
  });

  it('verifies backup successfully when schedule exists', () => {
    const dr = new DisasterRecovery();
    const schedule = dr.createBackupSchedule('quantsync', 30);
    const verification = dr.verifyBackup(schedule.id);

    expect(verification.verified).toBe(true);
    expect(verification.integrityHash).toContain('sha256:');
    expect(verification.sizeBytes).toBeGreaterThan(0);
    expect(verification.issues).toHaveLength(0);
  });

  it('reports issues when verifying non-existent backup', () => {
    const dr = new DisasterRecovery();
    const verification = dr.verifyBackup('nonexistent_id');

    expect(verification.verified).toBe(false);
    expect(verification.issues).toContain('Backup schedule not found');
  });

  it('executes DR drill and returns result', () => {
    const dr = new DisasterRecovery();
    const result = dr.drDrill({
      name: 'failover-test',
      type: 'failover',
      targetService: 'quantmail',
      description: 'Test failover to secondary region',
    });

    expect(result.scenario.name).toBe('failover-test');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.actualRTO).toBeGreaterThan(0);
    expect(result.targetRTO).toBe(300000);
  });

  it('runs restore DR drill', () => {
    const dr = new DisasterRecovery();
    const result = dr.drDrill({
      name: 'restore-test',
      type: 'restore',
      targetService: 'quantdrive',
      description: 'Test data restore from backup',
    });

    expect(result.steps.some((s) => s.name === 'restore_data')).toBe(true);
  });

  it('calculates RTO for a service', () => {
    const dr = new DisasterRecovery();
    const estimate = dr.calculateRTO('quantmail');

    expect(estimate.service).toBe('quantmail');
    expect(estimate.estimatedRTO).toBeGreaterThan(0);
    expect(estimate.factors.length).toBeGreaterThan(0);
    expect(estimate.confidence).toBe('low');
  });

  it('increases confidence after a drill', () => {
    const dr = new DisasterRecovery();
    dr.drDrill({
      name: 'drill',
      type: 'failover',
      targetService: 'quantchat',
      description: 'Test',
    });

    const estimate = dr.calculateRTO('quantchat');
    expect(estimate.confidence).toBe('high');
  });

  it('tracks drill history', () => {
    const dr = new DisasterRecovery();
    dr.drDrill({
      name: 'drill-1',
      type: 'failover',
      targetService: 'quantmail',
      description: 'First drill',
    });
    dr.drDrill({
      name: 'drill-2',
      type: 'restore',
      targetService: 'quantsync',
      description: 'Second drill',
    });

    expect(dr.getDrillHistory()).toHaveLength(2);
  });

  it('lists all schedules', () => {
    const dr = new DisasterRecovery();
    dr.createBackupSchedule('quantmail', 15);
    dr.createBackupSchedule('quantchat', 5);

    expect(dr.getSchedules()).toHaveLength(2);
  });
});
