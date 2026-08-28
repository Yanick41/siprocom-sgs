import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frErrors from './locales/fr/errors.json';
import frProducts from './locales/fr/products.json';
import frAdmin from './locales/fr/admin.json';
import frStock from './locales/fr/stock.json';
import frAlerts from './locales/fr/alerts.json';
import frReports from './locales/fr/reports.json';

/**
 * French only. The i18n layer stays in place rather than inlining 370 strings
 * across the components: every t() call keeps working, nothing needs rewriting,
 * and adding a second language later is a file plus one line here.
 */
export const SUPPORTED_LANGUAGES = [{ code: 'fr', label: 'Français', flag: '🇫🇷' }];

export const DEFAULT_LANGUAGE = 'fr';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        common: frCommon, auth: frAuth, errors: frErrors, products: frProducts,
        admin: frAdmin, stock: frStock, alerts: frAlerts, reports: frReports,
      },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['fr'],
    lng: 'fr', // fixed: no detection, no stored preference, no negotiation
    ns: ['common', 'auth', 'errors', 'products', 'admin', 'stock', 'alerts', 'reports'],
    defaultNS: 'common',
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

// Keep <html lang> in sync - matters for screen readers and browser behaviour.
const syncHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};
syncHtmlLang(i18n.resolvedLanguage || DEFAULT_LANGUAGE);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
