import { QuantLanguage, ScriptType } from '../types.js';

const SCRIPT_RANGES: Array<{ script: ScriptType; start: number; end: number }> = [
  { script: ScriptType.Devanagari, start: 0x0900, end: 0x097f },
  { script: ScriptType.Bengali, start: 0x0980, end: 0x09ff },
  { script: ScriptType.Gurmukhi, start: 0x0a00, end: 0x0a7f },
  { script: ScriptType.Gujarati, start: 0x0a80, end: 0x0aff },
  { script: ScriptType.Odia, start: 0x0b00, end: 0x0b7f },
  { script: ScriptType.Tamil, start: 0x0b80, end: 0x0bff },
  { script: ScriptType.Telugu, start: 0x0c00, end: 0x0c7f },
  { script: ScriptType.Kannada, start: 0x0c80, end: 0x0cff },
  { script: ScriptType.Malayalam, start: 0x0d00, end: 0x0d7f },
];

const SCRIPT_TO_LANGUAGE: Record<string, QuantLanguage> = {
  [ScriptType.Devanagari]: QuantLanguage.hindi,
  [ScriptType.Tamil]: QuantLanguage.tamil,
  [ScriptType.Telugu]: QuantLanguage.telugu,
  [ScriptType.Bengali]: QuantLanguage.bengali,
  [ScriptType.Gujarati]: QuantLanguage.gujarati,
  [ScriptType.Gurmukhi]: QuantLanguage.punjabi,
  [ScriptType.Kannada]: QuantLanguage.kannada,
  [ScriptType.Malayalam]: QuantLanguage.malayalam,
  [ScriptType.Odia]: QuantLanguage.odia,
  [ScriptType.Latin]: QuantLanguage.english,
};

export class LanguageDetector {
  detectScript(text: string): ScriptType {
    const counts = new Map<ScriptType, number>();
    for (const char of text) {
      const code = char.codePointAt(0)!;
      for (const range of SCRIPT_RANGES) {
        if (code >= range.start && code <= range.end) {
          counts.set(range.script, (counts.get(range.script) ?? 0) + 1);
          break;
        }
      }
      if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) {
        counts.set(ScriptType.Latin, (counts.get(ScriptType.Latin) ?? 0) + 1);
      }
    }
    let maxScript = ScriptType.Latin;
    let maxCount = 0;
    for (const [script, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxScript = script;
      }
    }
    return maxScript;
  }

  detectLanguage(text: string): { language: QuantLanguage; confidence: number } {
    if (this.isCodeSwitching(text)) {
      return { language: QuantLanguage.hinglish, confidence: 0.75 };
    }
    const script = this.detectScript(text);
    const language = SCRIPT_TO_LANGUAGE[script] ?? QuantLanguage.english;
    const confidence = text.length > 10 ? 0.9 : 0.6;
    return { language, confidence };
  }

  isCodeSwitching(text: string): boolean {
    let hasLatin = false;
    let hasIndic = false;
    for (const char of text) {
      const code = char.codePointAt(0)!;
      if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) {
        hasLatin = true;
      }
      for (const range of SCRIPT_RANGES) {
        if (code >= range.start && code <= range.end) {
          hasIndic = true;
          break;
        }
      }
      if (hasLatin && hasIndic) return true;
    }
    return false;
  }
}
