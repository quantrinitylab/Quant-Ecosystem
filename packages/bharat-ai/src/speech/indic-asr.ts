import { ASRConfig, ASRResult, QuantLanguage } from '../types.js';

const SUPPORTED_LANGUAGES: QuantLanguage[] = [
  QuantLanguage.hindi,
  QuantLanguage.english,
  QuantLanguage.tamil,
  QuantLanguage.telugu,
  QuantLanguage.bengali,
  QuantLanguage.marathi,
  QuantLanguage.gujarati,
  QuantLanguage.kannada,
  QuantLanguage.malayalam,
  QuantLanguage.punjabi,
  QuantLanguage.odia,
  QuantLanguage.hinglish,
];

export class IndicASR {
  private config: ASRConfig;

  constructor(config: ASRConfig) {
    this.config = config;
  }

  async transcribe(_audio: Uint8Array, language: QuantLanguage): Promise<ASRResult> {
    const mockTexts: Record<string, string> = {
      [QuantLanguage.hindi]: 'namaste, kya haal hai',
      [QuantLanguage.english]: 'hello, how are you',
      [QuantLanguage.tamil]: 'vanakkam, eppadi irukkireerkal',
      [QuantLanguage.telugu]: 'namaskaram, meeru ela unnaru',
      [QuantLanguage.bengali]: 'nomoshkar, kemon acho',
      [QuantLanguage.marathi]: 'namaskar, kasa aahat',
      [QuantLanguage.gujarati]: 'namaste, kem cho',
      [QuantLanguage.kannada]: 'namaskara, hegiddira',
      [QuantLanguage.malayalam]: 'namaskaram, sughamano',
      [QuantLanguage.punjabi]: 'sat sri akal, ki haal hai',
      [QuantLanguage.odia]: 'namaskar, kemiti achanti',
      [QuantLanguage.hinglish]: 'hello bhai, kya scene hai',
    };

    const text = mockTexts[language] ?? mockTexts[QuantLanguage.english]!;
    const confidence = this.config.enableCodeSwitching ? 0.82 : 0.91;

    return { text, language, confidence };
  }

  getSupportedLanguages(): QuantLanguage[] {
    return SUPPORTED_LANGUAGES;
  }
}
