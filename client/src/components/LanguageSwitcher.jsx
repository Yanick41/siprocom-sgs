import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';

/**
 * Available on every screen, including login (before authentication).
 * Once a user is signed in, the choice is also persisted to their profile
 * so it follows them across devices (Phase 1: PATCH /auth/me/locale).
 */
export default function LanguageSwitcher({ className = '' }) {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage;

  return (
    <div
      className={`inline-flex rounded-lg border border-slate-300 bg-white p-0.5 ${className}`}
      role="group"
      aria-label={t('language.change')}
    >
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = current === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => i18n.changeLanguage(lang.code)}
            aria-pressed={isActive}
            className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-sgs-navy text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span aria-hidden="true" className="mr-1.5">
              {lang.flag}
            </span>
            {lang.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
