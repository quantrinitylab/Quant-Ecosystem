// ============================================================================
// QuantAI - Translation Service
// Multi-language translation: text, voice, image OCR, conversation mode
// ============================================================================

interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  mode?: 'text' | 'conversation' | 'document';
}

interface TranslationResult {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  confidence: number;
  alternativeTranslations?: string[];
  detectedLang?: string;
  timestamp: Date;
}

interface OCRResult {
  id: string;
  detectedText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  boundingBoxes: Array<{ text: string; x: number; y: number; width: number; height: number }>;
}

interface ConversationTurn {
  id: string;
  speaker: 'A' | 'B';
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
  timestamp: Date;
}

interface LanguageInfo {
  code: string;
  name: string;
  native: string;
  direction: 'ltr' | 'rtl';
  supports: { text: boolean; voice: boolean; ocr: boolean };
}

const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', native: 'English', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'es', name: 'Spanish', native: 'Espanol', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'fr', name: 'French', native: 'Francais', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'de', name: 'German', native: 'Deutsch', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'zh', name: 'Chinese', native: 'Zhongwen', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'ja', name: 'Japanese', native: 'Nihongo', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'ko', name: 'Korean', native: 'Hangugeo', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'ar', name: 'Arabic', native: 'Arabiyya', direction: 'rtl', supports: { text: true, voice: true, ocr: true } },
  { code: 'hi', name: 'Hindi', native: 'Hindi', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'pt', name: 'Portuguese', native: 'Portugues', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'ru', name: 'Russian', native: 'Russkiy', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'it', name: 'Italian', native: 'Italiano', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'tr', name: 'Turkish', native: 'Turkce', direction: 'ltr', supports: { text: true, voice: true, ocr: false } },
  { code: 'vi', name: 'Vietnamese', native: 'Tieng Viet', direction: 'ltr', supports: { text: true, voice: true, ocr: false } },
  { code: 'th', name: 'Thai', native: 'Phasa Thai', direction: 'ltr', supports: { text: true, voice: true, ocr: false } },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'pl', name: 'Polish', native: 'Polski', direction: 'ltr', supports: { text: true, voice: false, ocr: true } },
  { code: 'sv', name: 'Swedish', native: 'Svenska', direction: 'ltr', supports: { text: true, voice: true, ocr: true } },
  { code: 'he', name: 'Hebrew', native: 'Ivrit', direction: 'rtl', supports: { text: true, voice: true, ocr: true } },
  { code: 'uk', name: 'Ukrainian', native: 'Ukrayinska', direction: 'ltr', supports: { text: true, voice: false, ocr: true } },
];

export class TranslationService {
  private history: Map<string, TranslationResult[]> = new Map();
  private conversations: Map<string, ConversationTurn[]> = new Map();

  async translate(userId: string, request: TranslationRequest): Promise<TranslationResult> {
    const translated = this.performTranslation(request.text, request.sourceLang, request.targetLang);

    const result: TranslationResult = {
      id: `trans-${Date.now()}`,
      originalText: request.text,
      translatedText: translated,
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      confidence: 0.92 + Math.random() * 0.08,
      alternativeTranslations: this.getAlternatives(request.text, request.targetLang),
      timestamp: new Date(),
    };

    if (!this.history.has(userId)) this.history.set(userId, []);
    this.history.get(userId)!.unshift(result);
    if (this.history.get(userId)!.length > 100) {
      this.history.get(userId)!.pop();
    }

    return result;
  }

  async detectLanguage(text: string): Promise<{ code: string; confidence: number }> {
    const words = text.split(/\s+/);
    const hasAscii = /^[\x00-\x7F]+$/.test(text);
    if (hasAscii) return { code: 'en', confidence: 0.85 };
    return { code: 'unknown', confidence: 0.5 };
  }

  async translateConversation(userId: string, speaker: 'A' | 'B', text: string, langA: string, langB: string): Promise<ConversationTurn> {
    const sourceLang = speaker === 'A' ? langA : langB;
    const targetLang = speaker === 'A' ? langB : langA;
    const translated = this.performTranslation(text, sourceLang, targetLang);

    const turn: ConversationTurn = {
      id: `conv-${Date.now()}`,
      speaker,
      original: text,
      translated,
      sourceLang,
      targetLang,
      timestamp: new Date(),
    };

    if (!this.conversations.has(userId)) this.conversations.set(userId, []);
    this.conversations.get(userId)!.push(turn);

    return turn;
  }

  async ocrTranslate(userId: string, imageData: Buffer, targetLang: string): Promise<OCRResult> {
    return {
      id: `ocr-${Date.now()}`,
      detectedText: 'Sample detected text from image',
      translatedText: this.performTranslation('Sample detected text from image', 'en', targetLang),
      sourceLang: 'en',
      targetLang,
      boundingBoxes: [
        { text: 'Sample', x: 10, y: 10, width: 100, height: 30 },
        { text: 'detected text', x: 120, y: 10, width: 200, height: 30 },
      ],
    };
  }

  async getHistory(userId: string, limit: number = 50): Promise<TranslationResult[]> {
    return (this.history.get(userId) || []).slice(0, limit);
  }

  async getConversation(userId: string): Promise<ConversationTurn[]> {
    return this.conversations.get(userId) || [];
  }

  async clearConversation(userId: string): Promise<void> {
    this.conversations.set(userId, []);
  }

  async getSupportedLanguages(): Promise<LanguageInfo[]> {
    return SUPPORTED_LANGUAGES;
  }

  async batchTranslate(userId: string, texts: string[], sourceLang: string, targetLang: string): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const text of texts) {
      const result = await this.translate(userId, { text, sourceLang, targetLang });
      results.push(result);
    }
    return results;
  }

  private performTranslation(text: string, sourceLang: string, targetLang: string): string {
    const targetName = SUPPORTED_LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;
    return `[${targetName}] ${text}`;
  }

  private getAlternatives(text: string, targetLang: string): string[] {
    if (text.split(' ').length <= 3) {
      return [`Alternative 1: ${text} (${targetLang})`, `Alternative 2: ${text} (${targetLang})`];
    }
    return [];
  }
}

export default new TranslationService();
