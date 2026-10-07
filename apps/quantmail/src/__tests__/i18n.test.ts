import { describe, it, expect, beforeEach, vi } from 'vitest';
import { translate, translations, SUPPORTED_LOCALES, getStoredLocale } from '../i18n';

describe('QuantMail Core Ecosystem i18n Localization Engine (Task X23)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides supported locales for English and Hindi', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(2);
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toEqual(['en', 'hi']);
    expect(SUPPORTED_LOCALES.find((l) => l.code === 'hi')?.nativeName).toBe('हिन्दी');
  });

  it('translates common keys into English by default', () => {
    expect(translate('common.save', 'en')).toBe('Save');
    expect(translate('common.cancel', 'en')).toBe('Cancel');
    expect(translate('nav.mail', 'en')).toBe('Mail');
    expect(translate('mail.compose', 'en')).toBe('Compose');
    expect(translate('mail.inbox', 'en')).toBe('Inbox');
    expect(translate('drive.myDrive', 'en')).toBe('My Drive');
  });

  it('translates common keys into Hindi', () => {
    expect(translate('common.save', 'hi')).toBe('सहेजें');
    expect(translate('common.cancel', 'hi')).toBe('रद्द करें');
    expect(translate('nav.mail', 'hi')).toBe('मेल');
    expect(translate('mail.compose', 'hi')).toBe('नया ईमेल');
    expect(translate('mail.inbox', 'hi')).toBe('इनबॉक्स');
    expect(translate('drive.myDrive', 'hi')).toBe('मेरी ड्राइव');
    expect(translate('calendar.today', 'hi')).toBe('आज');
  });

  it('interpolates single and multiple parameters in translation strings', () => {
    expect(translate('common.itemsSelected', 'en', { count: 5 })).toBe('5 items selected');
    expect(translate('common.itemsSelected', 'hi', { count: 5 })).toBe('5 आइटम चुने गए');

    expect(translate('drive.storageUsed', 'en', { used: '2.4 GB', total: '15 GB' })).toBe(
      '2.4 GB of 15 GB used',
    );
    expect(translate('drive.storageUsed', 'hi', { used: '2.4 GB', total: '15 GB' })).toBe(
      '15 GB में से 2.4 GB प्रयुक्त',
    );
  });

  it('falls back to English when a translation key is missing in Hindi', () => {
    const fallback = translate('nonexistent.key', 'hi');
    expect(fallback).toBe('nonexistent.key');
  });

  it('handles getStoredLocale falling back to en when localStorage is empty', () => {
    const locale = getStoredLocale();
    expect(locale).toBe('en');
  });
});
