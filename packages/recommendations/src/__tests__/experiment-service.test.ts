import { describe, it, expect } from 'vitest';
import { ExperimentService } from '../experiment/experiment-service';

describe('ExperimentService', () => {
  function createService(): ExperimentService {
    const service = new ExperimentService();
    service.registerExperiment({
      id: 'exp-001',
      name: 'New Ranking Algorithm',
      buckets: ['control', 'treatment'],
      trafficAllocation: { control: 0.5, treatment: 0.5 },
    });
    return service;
  }

  it('should assign bucket deterministically (same user + experiment = same bucket always)', () => {
    const service = createService();

    const bucket1 = service.assignBucket('user123', 'exp-001');
    const bucket2 = service.assignBucket('user123', 'exp-001');
    const bucket3 = service.assignBucket('user123', 'exp-001');

    expect(bucket1).toBe(bucket2);
    expect(bucket2).toBe(bucket3);
    expect(['control', 'treatment']).toContain(bucket1);
  });

  it('should assign different users to different buckets', () => {
    const service = createService();

    // With enough users, both buckets should be populated
    const buckets = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const bucket = service.assignBucket(`user${i}`, 'exp-001');
      buckets.add(bucket);
    }

    expect(buckets.size).toBe(2);
  });

  it('should throw for unknown experiment', () => {
    const service = createService();
    expect(() => service.assignBucket('user1', 'nonexistent')).toThrow(
      'Experiment nonexistent not found',
    );
  });

  it('should log exposure events', () => {
    const service = createService();
    service.logExposure('user1', 'exp-001', 'control');
    service.logExposure('user2', 'exp-001', 'treatment');

    expect(service.getExposureCount('exp-001')).toBe(2);
  });

  it('should compute p-value with known data', () => {
    const service = new ExperimentService();
    service.registerExperiment({
      id: 'exp-stats',
      name: 'Stats Test',
      buckets: ['control', 'treatment'],
      trafficAllocation: { control: 0.5, treatment: 0.5 },
    });

    // Simulate: control has 10% conversion, treatment has 20%
    // 100 users in each group
    for (let i = 0; i < 100; i++) {
      service.logExposure(`control_user_${i}`, 'exp-stats', 'control');
      if (i < 10) {
        service.logConversion(`control_user_${i}`, 'exp-stats', true);
      }
    }
    for (let i = 0; i < 100; i++) {
      service.logExposure(`treatment_user_${i}`, 'exp-stats', 'treatment');
      if (i < 20) {
        service.logConversion(`treatment_user_${i}`, 'exp-stats', true);
      }
    }

    const result = service.computeResult('exp-stats');

    expect(result.experimentId).toBe('exp-stats');
    expect(result.bucketStats['control'].exposures).toBe(100);
    expect(result.bucketStats['control'].conversions).toBe(10);
    expect(result.bucketStats['control'].rate).toBeCloseTo(0.1);
    expect(result.bucketStats['treatment'].exposures).toBe(100);
    expect(result.bucketStats['treatment'].conversions).toBe(20);
    expect(result.bucketStats['treatment'].rate).toBeCloseTo(0.2);

    // Lift should be 100% (from 10% to 20%)
    expect(result.lift).toBeCloseTo(1.0, 1);

    // p-value should be relatively small for this effect size
    expect(result.pValue).toBeLessThan(0.1);
  });

  it('should report significance correctly', () => {
    const service = new ExperimentService();
    service.registerExperiment({
      id: 'exp-sig',
      name: 'Significance Test',
      buckets: ['control', 'treatment'],
      trafficAllocation: { control: 0.5, treatment: 0.5 },
    });

    // Very large effect with large sample
    for (let i = 0; i < 500; i++) {
      service.logExposure(`ctrl_${i}`, 'exp-sig', 'control');
      if (i < 50) service.logConversion(`ctrl_${i}`, 'exp-sig', true);
    }
    for (let i = 0; i < 500; i++) {
      service.logExposure(`treat_${i}`, 'exp-sig', 'treatment');
      if (i < 150) service.logConversion(`treat_${i}`, 'exp-sig', true);
    }

    const result = service.computeResult('exp-sig');
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('should handle no conversions gracefully', () => {
    const service = createService();
    service.logExposure('user1', 'exp-001', 'control');
    service.logExposure('user2', 'exp-001', 'treatment');

    const result = service.computeResult('exp-001');
    expect(result.pValue).toBe(1);
    expect(result.lift).toBe(0);
    expect(result.significant).toBe(false);
  });

  it('should support multiple buckets', () => {
    const service = new ExperimentService();
    service.registerExperiment({
      id: 'multi',
      name: 'Multi-variant',
      buckets: ['control', 'variant_a', 'variant_b'],
      trafficAllocation: { control: 0.34, variant_a: 0.33, variant_b: 0.33 },
    });

    const buckets = new Set<string>();
    for (let i = 0; i < 300; i++) {
      buckets.add(service.assignBucket(`user${i}`, 'multi'));
    }

    expect(buckets.size).toBe(3);
  });
});
