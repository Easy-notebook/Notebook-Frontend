import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { Resource } from 'i18next';

import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';

// Type definitions for translation resources
interface TranslationResource {
  translation: Record<string, any>;
}

interface Resources {
  en: TranslationResource;
  zh: TranslationResource;
}

const resources: Resources = {
  en: {
    translation: enTranslation
  },
  zh: {
    translation: zhTranslation
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh', // Default language is Chinese
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false,
    }
  });

export default i18n; 