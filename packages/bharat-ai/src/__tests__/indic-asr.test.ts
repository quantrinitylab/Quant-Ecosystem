import { IndicASR } from '../speech/indic-asr.js';
import { QuantLanguage } from '../types.js';

describe('IndicASR', () => {
  it('should transcribe and return a valid result', async () => {
    const asr = new IndicASR({ language: QuantLanguage.hindi });
    const audio = new Uint8Array(1000);
    const result = await asr.transcribe(audio, QuantLanguage.hindi);
    expect(result.text).toBeTruthy();
    expect(result.language).toBe(QuantLanguage.hindi);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should return all 12 supported languages', () => {
    const asr = new IndicASR({ language: QuantLanguage.english });
    const languages = asr.getSupportedLanguages();
    expect(languages).toHaveLength(12);
    expect(languages).toContain(QuantLanguage.hindi);
    expect(languages).toContain(QuantLanguage.tamil);
    expect(languages).toContain(QuantLanguage.hinglish);
  });

  it('should have lower confidence with code-switching enabled', async () => {
    const asr = new IndicASR({ language: QuantLanguage.hinglish, enableCodeSwitching: true });
    const audio = new Uint8Array(500);
    const result = await asr.transcribe(audio, QuantLanguage.hinglish);
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('should transcribe for different languages', async () => {
    const asr = new IndicASR({ language: QuantLanguage.tamil });
    const audio = new Uint8Array(800);
    const result = await asr.transcribe(audio, QuantLanguage.tamil);
    expect(result.language).toBe(QuantLanguage.tamil);
    expect(result.text).toContain('vanakkam');
  });
});
