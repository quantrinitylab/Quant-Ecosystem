import { TranslationStore } from '../i18n/translation-store.js';
import { QuantLanguage } from '../types.js';

describe('TranslationStore', () => {
  let store: TranslationStore;

  beforeEach(() => {
    store = new TranslationStore();
  });

  it('should set and get a translation', () => {
    store.set(QuantLanguage.hindi, 'greeting', 'namaste');
    expect(store.get(QuantLanguage.hindi, 'greeting')).toBe('namaste');
  });

  it('should return undefined for missing key', () => {
    expect(store.get(QuantLanguage.hindi, 'missing')).toBeUndefined();
  });

  it('should fallback to hindi then english', () => {
    store.set(QuantLanguage.english, 'hello', 'hello');
    store.setFallbackChain([QuantLanguage.hindi, QuantLanguage.english]);
    expect(store.get(QuantLanguage.tamil, 'hello')).toBe('hello');
  });

  it('should use custom fallback chain', () => {
    store.set(QuantLanguage.marathi, 'greeting', 'namaskar');
    store.setFallbackChain([QuantLanguage.marathi, QuantLanguage.english]);
    expect(store.get(QuantLanguage.gujarati, 'greeting')).toBe('namaskar');
  });

  it('should interpolate variables in template', () => {
    const result = store.interpolate('Hello {{name}}, welcome to {{city}}', {
      name: 'Raj',
      city: 'Mumbai',
    });
    expect(result).toBe('Hello Raj, welcome to Mumbai');
  });

  it('should replace missing vars with empty string', () => {
    const result = store.interpolate('Hello {{name}}', {});
    expect(result).toBe('Hello ');
  });
});
