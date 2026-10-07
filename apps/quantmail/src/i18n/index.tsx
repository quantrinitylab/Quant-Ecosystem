'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type SupportedLocale = 'en' | 'hi';

export interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  supportedLocales: Array<{ code: SupportedLocale; label: string; nativeName: string }>;
}

export const SUPPORTED_LOCALES: Array<{
  code: SupportedLocale;
  label: string;
  nativeName: string;
}> = [
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
];

export const translations: Record<SupportedLocale, Record<string, string>> = {
  en: {
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.retry': 'Retry',
    'common.error': 'An error occurred',
    'common.success': 'Success',
    'common.itemsSelected': '{count} items selected',

    // Navigation
    'nav.mail': 'Mail',
    'nav.drive': 'Drive',
    'nav.calendar': 'Calendar',
    'nav.contacts': 'Contacts',
    'nav.docs': 'Docs',
    'nav.git': 'QuantGit',
    'nav.settings': 'Settings',
    'nav.quanty': 'Quanty AI',

    // Mail
    'mail.compose': 'Compose',
    'mail.inbox': 'Inbox',
    'mail.sent': 'Sent',
    'mail.drafts': 'Drafts',
    'mail.archive': 'Archive',
    'mail.trash': 'Trash',
    'mail.spam': 'Spam',
    'mail.starred': 'Starred',
    'mail.undoSend': 'Undo',
    'mail.sending': 'Sending...',
    'mail.emailSent': 'Email sent',

    // Drive
    'drive.myDrive': 'My Drive',
    'drive.sharedWithMe': 'Shared with me',
    'drive.uploadFile': 'Upload file',
    'drive.newFolder': 'New folder',
    'drive.storageUsed': '{used} of {total} used',

    // Calendar
    'calendar.today': 'Today',
    'calendar.newEvent': 'New event',
    'calendar.month': 'Month',
    'calendar.week': 'Week',
    'calendar.day': 'Day',
    'calendar.agenda': 'Agenda',

    // Docs
    'docs.newDoc': 'New Document',
    'docs.share': 'Share',
    'docs.versionHistory': 'Version History',
    'docs.wordCount': '{count} words',

    // Contacts
    'contacts.newContact': 'New Contact',
    'contacts.importContacts': 'Import Contacts',
    'contacts.mergeDuplicates': 'Merge Duplicates',
    'contacts.groups': 'Groups',

    // Git
    'git.repositories': 'Repositories',
    'git.newRepo': 'New repository',
    'git.pullRequests': 'Pull Requests',
    'git.issues': 'Issues',

    // Settings
    'settings.general': 'General',
    'settings.security': 'Security',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.selectLanguage': 'Select Language',
  },
  hi: {
    // Common
    'common.save': 'सहेजें',
    'common.cancel': 'रद्द करें',
    'common.delete': 'हटाएं',
    'common.edit': 'संपादित करें',
    'common.search': 'खोजें',
    'common.loading': 'लोड हो रहा है...',
    'common.confirm': 'पुष्टि करें',
    'common.close': 'बंद करें',
    'common.back': 'वापस',
    'common.retry': 'पुनः प्रयास करें',
    'common.error': 'एक त्रुटि हुई',
    'common.success': 'सफलता',
    'common.itemsSelected': '{count} आइटम चुने गए',

    // Navigation
    'nav.mail': 'मेल',
    'nav.drive': 'ड्राइव',
    'nav.calendar': 'कैलेंडर',
    'nav.contacts': 'संपर्क',
    'nav.docs': 'दस्तावेज़',
    'nav.git': 'क्वांटगिट',
    'nav.settings': 'सेटिंग्स',
    'nav.quanty': 'क्वांटी एआई',

    // Mail
    'mail.compose': 'नया ईमेल',
    'mail.inbox': 'इनबॉक्स',
    'mail.sent': 'भेजे गए',
    'mail.drafts': 'ड्राफ्ट',
    'mail.archive': 'संग्रहीत',
    'mail.trash': 'कचरा',
    'mail.spam': 'स्पैम',
    'mail.starred': 'तारांकित',
    'mail.undoSend': 'पूर्ववत करें',
    'mail.sending': 'भेजा जा रहा है...',
    'mail.emailSent': 'ईमेल भेज दिया गया',

    // Drive
    'drive.myDrive': 'मेरी ड्राइव',
    'drive.sharedWithMe': 'मेरे साथ साझा',
    'drive.uploadFile': 'फ़ाइल अपलोड करें',
    'drive.newFolder': 'नया फ़ोल्डर',
    'drive.storageUsed': '{total} में से {used} प्रयुक्त',

    // Calendar
    'calendar.today': 'आज',
    'calendar.newEvent': 'नया इवेंट',
    'calendar.month': 'महीना',
    'calendar.week': 'सप्ताह',
    'calendar.day': 'दिन',
    'calendar.agenda': 'कार्यसूची',

    // Docs
    'docs.newDoc': 'नया दस्तावेज़',
    'docs.share': 'साझा करें',
    'docs.versionHistory': 'संस्करण इतिहास',
    'docs.wordCount': '{count} शब्द',

    // Contacts
    'contacts.newContact': 'नया संपर्क',
    'contacts.importContacts': 'संपर्क आयात करें',
    'contacts.mergeDuplicates': 'डुप्लिकेट्स मर्ज करें',
    'contacts.groups': 'समूह',

    // Git
    'git.repositories': 'रिपॉजिटरीज़',
    'git.newRepo': 'नई रिपॉजिटरी',
    'git.pullRequests': 'पुल अनुरोध',
    'git.issues': 'समस्याएं',

    // Settings
    'settings.general': 'सामान्य',
    'settings.security': 'सुरक्षा',
    'settings.language': 'भाषा',
    'settings.theme': 'थीम',
    'settings.selectLanguage': 'भाषा चुनें',
  },
};

const STORAGE_KEY = 'quant_preferred_locale';

export function getStoredLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'hi' || stored === 'en') {
      return stored;
    }
    // Fallback to browser language if Hindi
    if (window.navigator?.language?.startsWith('hi')) {
      return 'hi';
    }
  } catch {
    // Ignore localStorage access errors
  }
  return 'en';
}

export function translate(
  key: string,
  locale: SupportedLocale = 'en',
  params?: Record<string, string | number>,
): string {
  const dictionary = translations[locale] || translations.en;
  let text = dictionary[key] || translations.en[key] || key;

  if (params) {
    for (const [paramKey, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    }
  }

  return text;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => translate(key, 'en', params),
  supportedLocales: SUPPORTED_LOCALES,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en');

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, newLocale);
        window.dispatchEvent(new CustomEvent('quant:locale-changed', { detail: newLocale }));
      } catch {
        // Ignore
      }
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return translate(key, locale, params);
    },
    [locale],
  );

  const contextValue = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      supportedLocales: SUPPORTED_LOCALES,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  return useContext(I18nContext);
}
