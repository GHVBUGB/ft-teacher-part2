import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';

type Language = 'en' | 'zh-CN';
type I18n = {
  language: Language;
  dateLocale: string;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
};
const LANGUAGE_KEY = 'ft-training:language';
const copy = en as Record<string, string>;
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
const sourceKeys = new Map(Object.entries(copy).map(([key, text]) => [normalize(text), key]));
const LanguageContext = createContext<I18n | null>(null);

function initialLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'zh-CN' ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'zh-CN' ? '51Talk · 教师培训' : '51Talk · Teacher Training';
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Switching remains usable when browser storage is unavailable.
    }
  }, [language]);
  const value = useMemo<I18n>(() => ({
    language,
    dateLocale: language === 'zh-CN' ? 'zh-CN' : 'en-US',
    setLanguage,
    t: (key) => {
      const normalized = normalize(key);
      const source = Object.hasOwn(copy, key) ? key
        : Object.hasOwn(copy, normalized) ? normalized
        : sourceKeys.get(normalized);
      if (!source) return key;
      return language === 'zh-CN' ? source : copy[source];
    },
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('LanguageProvider is required');
  return value;
}
