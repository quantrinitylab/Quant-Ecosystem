import { HealthSafety } from '../safety/health-safety.js';

describe('HealthSafety', () => {
  let safety: HealthSafety;

  beforeEach(() => {
    safety = new HealthSafety();
  });

  it('should detect crisis when text contains crisis keywords', () => {
    const signal = safety.detectCrisis('I want to end my life');
    expect(signal.detected).toBe(true);
    expect(signal.keywords).toContain('end my life');
    expect(signal.helplines.length).toBeGreaterThan(0);
    expect(signal.message).toBeTruthy();
  });

  it('should detect crisis case-insensitively', () => {
    const signal = safety.detectCrisis('SUICIDE is something I think about');
    expect(signal.detected).toBe(true);
    expect(signal.keywords).toContain('suicide');
  });

  it('should return no crisis for normal text', () => {
    const signal = safety.detectCrisis('I feel great today and had a good workout');
    expect(signal.detected).toBe(false);
    expect(signal.keywords).toHaveLength(0);
    expect(signal.helplines).toHaveLength(0);
  });

  it('should include iCall, AASRA, and NIMHANS helplines', () => {
    const signal = safety.detectCrisis('I feel hopelessness');
    expect(signal.helplines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'iCall' }),
        expect.objectContaining({ name: 'AASRA' }),
        expect.objectContaining({ name: 'NIMHANS' }),
      ]),
    );
  });

  it('should return non-empty disclaimer', () => {
    const disclaimer = safety.getDisclaimer();
    expect(disclaimer).toBeTruthy();
    expect(disclaimer).toContain('not a medical professional');
  });

  it('should always recommend a doctor and never diagnose', () => {
    const result = safety.recommendDoctor(['headache', 'fever']);
    expect(result).toContain('consulting a qualified healthcare professional');
    expect(result).toContain('not a medical professional');
  });
});
