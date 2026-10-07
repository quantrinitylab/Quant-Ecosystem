import { LanguageDetector } from '../i18n/language-detector.js';
import { QuantLanguage, ScriptType } from '../types.js';

describe('LanguageDetector', () => {
  let detector: LanguageDetector;

  beforeEach(() => {
    detector = new LanguageDetector();
  });

  it('should detect Devanagari script', () => {
    expect(detector.detectScript('\u0928\u092E\u0938\u094D\u0924\u0947')).toBe(
      ScriptType.Devanagari,
    );
  });

  it('should detect Tamil script', () => {
    expect(detector.detectScript('\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD')).toBe(
      ScriptType.Tamil,
    );
  });

  it('should detect Telugu script', () => {
    expect(detector.detectScript('\u0C28\u0C2E\u0C38\u0C4D\u0C15\u0C3E\u0C30\u0C02')).toBe(
      ScriptType.Telugu,
    );
  });

  it('should detect Bengali script', () => {
    expect(detector.detectScript('\u09A8\u09AE\u09B8\u09CD\u0995\u09BE\u09B0')).toBe(
      ScriptType.Bengali,
    );
  });

  it('should detect Latin script for English', () => {
    expect(detector.detectScript('hello world')).toBe(ScriptType.Latin);
  });

  it('should detect Hindi language from Devanagari text', () => {
    const result = detector.detectLanguage(
      '\u0928\u092E\u0938\u094D\u0924\u0947 \u0926\u0941\u0928\u093F\u092F\u093E',
    );
    expect(result.language).toBe(QuantLanguage.hindi);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect code-switching (Hinglish)', () => {
    const result = detector.detectLanguage('hello \u0926\u0941\u0928\u093F\u092F\u093E');
    expect(result.language).toBe(QuantLanguage.hinglish);
  });

  it('should identify code-switching text', () => {
    expect(detector.isCodeSwitching('hello \u0926\u0941\u0928\u093F\u092F\u093E')).toBe(true);
  });

  it('should not flag pure English as code-switching', () => {
    expect(detector.isCodeSwitching('hello world')).toBe(false);
  });

  it('should not flag pure Devanagari as code-switching', () => {
    expect(detector.isCodeSwitching('\u0928\u092E\u0938\u094D\u0924\u0947')).toBe(false);
  });
});
