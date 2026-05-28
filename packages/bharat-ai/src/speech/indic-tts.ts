import { TTSConfig, TTSResult, QuantLanguage } from '../types.js';

export interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: QuantLanguage;
}

const VOICES: Voice[] = [
  { id: 'hi-m-1', name: 'Arjun', gender: 'male', language: QuantLanguage.hindi },
  { id: 'hi-f-1', name: 'Priya', gender: 'female', language: QuantLanguage.hindi },
  { id: 'ta-m-1', name: 'Karthik', gender: 'male', language: QuantLanguage.tamil },
  { id: 'ta-f-1', name: 'Lakshmi', gender: 'female', language: QuantLanguage.tamil },
  { id: 'te-m-1', name: 'Ravi', gender: 'male', language: QuantLanguage.telugu },
  { id: 'te-f-1', name: 'Anitha', gender: 'female', language: QuantLanguage.telugu },
  { id: 'bn-m-1', name: 'Amit', gender: 'male', language: QuantLanguage.bengali },
  { id: 'bn-f-1', name: 'Shreya', gender: 'female', language: QuantLanguage.bengali },
  { id: 'en-m-1', name: 'Raj', gender: 'male', language: QuantLanguage.english },
  { id: 'en-f-1', name: 'Meera', gender: 'female', language: QuantLanguage.english },
];

export class IndicTTS {
  private config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  async synthesize(text: string, language: QuantLanguage): Promise<TTSResult> {
    const speed = this.config.speed ?? 1.0;
    const duration = (text.length * 0.05) / speed;
    const audio = new Uint8Array(Math.ceil(duration * 16000));
    return { audio, duration, language };
  }

  getVoices(language: QuantLanguage): Voice[] {
    return VOICES.filter((v) => v.language === language);
  }
}
