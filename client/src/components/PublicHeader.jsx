import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * The bar across the top of every signed-out page.
 *
 * Shared literally, not copied, and that is the point: the landing page and
 * the login page are one flow, so the header must not move between them. A
 * header that redraws itself on navigation reads as arriving at a different
 * site; one that stays put reads as the same page changing its contents, which
 * is what actually happened.
 *
 * Only the action on the right differs, and it is always the way onward from
 * wherever you are: sign in from the landing page, back to it from the form.
 */
export default function PublicHeader({ action }) {
  const { t } = useTranslation(['install']);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg">
          <img src="/icon.svg" alt="" width="32" height="32" className="rounded-lg" />
          <span className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
            {t('install:brand')}
          </span>
        </Link>
        {action}
      </nav>
    </header>
  );
}

/** The header's right-hand action, styled once so the two pages cannot drift. */
export function HeaderAction({ to, icon: Icon, label, tone = 'solid' }) {
  return (
    <Link
      to={to}
      className={`flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${
        tone === 'solid'
          ? 'bg-sgs-primary text-white hover:bg-sgs-primary-dark'
          : 'border border-slate-200 text-slate-700 hover:border-sgs-accent hover:text-sgs-accent'
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
