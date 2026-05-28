import { QuantLanguage } from '../types.js';

export class TranslationStore {
  private translations = new Map<QuantLanguage, Map<string, string>>();
  private fallbackChain: QuantLanguage[] = [QuantLanguage.hindi, QuantLanguage.english];

  set(lang: QuantLanguage, key: string, value: string): void {
    if (!this.translations.has(lang)) {
      this.translations.set(lang, new Map());
    }
    this.translations.get(lang)!.set(key, value);
  }

  get(lang: QuantLanguage, key: string): string | undefined {
    const langMap = this.translations.get(lang);
    if (langMap?.has(key)) {
      return langMap.get(key);
    }
    for (const fallback of this.fallbackChain) {
      if (fallback === lang) continue;
      const fbMap = this.translations.get(fallback);
      if (fbMap?.has(key)) {
        return fbMap.get(key);
      }
    }
    return undefined;
  }

  setFallbackChain(chain: QuantLanguage[]): void {
    this.fallbackChain = chain;
  }

  interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }
}
