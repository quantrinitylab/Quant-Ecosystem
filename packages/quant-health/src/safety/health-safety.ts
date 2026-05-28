import { CrisisSignal } from '../types.js';

export class HealthSafety {
  static readonly DISCLAIMER =
    'I am not a medical professional. This information is for educational purposes only. Please consult a qualified healthcare provider for medical advice, diagnosis, or treatment.';

  static readonly CRISIS_KEYWORDS = [
    'suicide',
    'self-harm',
    'kill myself',
    'end my life',
    'no reason to live',
    'want to die',
    'hopelessness',
    'self harm',
  ];

  static readonly HELPLINES: { name: string; number: string }[] = [
    { name: 'iCall', number: '9152987821' },
    { name: 'AASRA', number: '9820466726' },
    { name: 'NIMHANS', number: '080-46110007' },
  ];

  detectCrisis(text: string): CrisisSignal {
    const lower = text.toLowerCase();
    const found = HealthSafety.CRISIS_KEYWORDS.filter((kw) => {
      // Use word-boundary matching to reduce false positives on partial matches
      const pattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      return pattern.test(lower);
    });
    if (found.length > 0) {
      return {
        detected: true,
        keywords: found,
        helplines: HealthSafety.HELPLINES,
        message:
          'You are not alone. Please reach out to a crisis helpline immediately. Your life matters.',
      };
    }
    return { detected: false, keywords: [], helplines: [], message: '' };
  }

  getDisclaimer(): string {
    return HealthSafety.DISCLAIMER;
  }

  recommendDoctor(symptoms: string[]): string {
    const symptomList = symptoms.join(', ');
    return `Based on your symptoms (${symptomList}), I strongly recommend consulting a qualified healthcare professional. ${HealthSafety.DISCLAIMER}`;
  }
}
