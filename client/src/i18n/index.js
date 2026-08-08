import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frErrors from './locales/fr/errors.json';
import frProducts from './locales/fr/products.json';
import frAdmin from './locales/fr/admin.json';
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enErrors from './locales/en/errors.json';
import enProducts from './locales/en/products.json';
import enAdmin from './locales/en/admin.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export const DEFAULT_LANGUAGE = 'fr';
export const LANGUAGE_STORAGE_KEY = 'sgs_language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: frCommon, auth: frAuth, errors: frErrors, products: frProducts, admin: frAdmin },
      en: { common: enCommon, auth: enAuth, errors: enErrors, products: enProducts, admin: enAdmin },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    ns: ['common', 'auth', 'errors', 'products', 'admin'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    // Surface missing keys loudly in development so translations can't silently drift.
    saveMissing: false,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => console.warn(`[i18n] Missing key "${ns}:${key}" for ${lngs.join(', ')}`)
      : undefined,
    returnNull: false,
  });

// Keep <html lang> in sync — matters for screen readers and browser behaviour.
const syncHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};
syncHtmlLang(i18n.resolvedLanguage || DEFAULT_LANGUAGE);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
