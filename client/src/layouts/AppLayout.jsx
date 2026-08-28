import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FiGrid, FiPackage, FiTag, FiTruck, FiLogIn, FiLogOut, FiRepeat,
  FiClipboard, FiBell, FiBarChart2, FiUsers, FiShield, FiMenu, FiX,
} from 'react-icons/fi';

import { useAuth } from '@/context/AuthContext';
import { alertsApi } from '@/api/resources';
import OfflineIndicator from '@/components/OfflineIndicator';
import { preloadScreens } from '@/lib/lazyWithRetry';

/**
 * Navigation is declared once with the permission each entry needs; the sidebar
 * filters itself per role. Entries for phases not yet built are commented out
 * rather than linking to dead routes.
 */
const NAV_SECTIONS = [
  {
    items: [{ to: '/dashboard', labelKey: 'nav.dashboard', icon: FiGrid, permission: 'stock.view' }],
  },
  {
    titleKey: 'nav.stock',
    items: [
      { to: '/receipts', labelKey: 'nav.receipts', icon: FiLogIn, permission: 'stock.view' },
      { to: '/issues', labelKey: 'nav.issues', icon: FiLogOut, permission: 'stock.view' },
      { to: '/stock', labelKey: 'nav.stockLevels', icon: FiBarChart2, permission: 'stock.view' },
      { to: '/movements', labelKey: 'nav.movements', icon: FiRepeat, permission: 'stock.view' },
      { to: '/adjustments', labelKey: 'nav.adjustments', icon: FiClipboard, permission: 'stock.write' },
    ],
  },
  {
    titleKey: 'nav.products',
    items: [
      { to: '/products', labelKey: 'nav.products', icon: FiPackage, permission: 'products.view' },
      { to: '/categories', labelKey: 'nav.categories', icon: FiTag, permission: 'categories.view' },
      { to: '/suppliers', labelKey: 'nav.suppliers', icon: FiTruck, permission: 'suppliers.view' },
    ],
  },
  {
    titleKey: 'nav.reports',
    items: [
      { to: '/alerts', labelKey: 'nav.alerts', icon: FiBell, permission: 'alerts.view' },
      { to: '/reports', labelKey: 'nav.reports', icon: FiBarChart2, permission: 'reports.view' },
    ],
  },
  {
    titleKey: 'nav.administration',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: FiUsers, permission: 'users.manage' },
      { to: '/audit', labelKey: 'nav.auditLog', icon: FiShield, permission: 'audit.view' },
      // No /settings entry: every parameter the cahier des charges lists -
      // thresholds, categories, suppliers - is edited on its own screen, so a
      // settings page would have nothing left to hold.
    ],
  },
];

export default function AppLayout() {
  const { t } = useTranslation(['common', 'auth', 'alerts']);

  /**
   * Pull the remaining screens into cache, once, after sign-in.
   *
   * It used to run on every page load, including the login screen, where it
   * fetched close to a megabyte of screens - recharts among them - while
   * somebody was typing a password. Nobody signed out benefits from a warm
   * offline cache; the person who does is the one already inside.
   */
  useEffect(() => {
    const warm = () => preloadScreens();
    const id =
      'requestIdleCallback' in window
        ? window.requestIdleCallback(warm, { timeout: 15_000 })
        : setTimeout(warm, 5_000);
    return () => {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, []);
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Polled rather than pushed: a warehouse app does not warrant a websocket,
  // and a minute of lag on a threshold alert changes no decision.
  const alertCountQuery = useQuery({
    queryKey: ['alerts', 'count'],
    queryFn: alertsApi.count,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const openAlerts = alertCountQuery.data?.total ?? 0;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      {sections.map((section, index) => (
        <div key={section.titleKey || `section-${index}`}>
          {section.titleKey && (
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t(`common:${section.titleKey}`)}
            </p>
          )}
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-lg border-l-4 px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-sgs-citron bg-sgs-primary text-white'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  {t(`common:${item.labelKey}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label={t('common:nav.dashboard')}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <FiX className="size-5" /> : <FiMenu className="size-5" />}
            </button>
            <div>
              <p className="font-bold leading-tight text-sgs-primary">{t('common:app.name')}</p>
              <p className="hidden text-xs leading-tight text-slate-500 sm:block">
                {t('common:app.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <OfflineIndicator />
            {can('alerts.view') && (
              <Link
                to="/alerts"
                className="relative flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={t('common:nav.alerts')}
                title={t('alerts:badge', { count: openAlerts })}
              >
                <FiBell className="size-5" />
                {openAlerts > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-sgs-danger px-1 text-[10px] font-bold leading-4 text-white">
                    {openAlerts > 99 ? '99+' : openAlerts}
                  </span>
                )}
              </Link>
            )}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-800">{user?.name}</p>
              <p className="text-xs leading-tight text-slate-500">
                {t(`auth:roles.${user?.role}`)}
              </p>
            </div>
            <button type="button" onClick={handleLogout} className="btn-secondary px-3">
              <FiLogOut className="size-4" />
              <span className="hidden sm:inline">{t('auth:logout.action')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
          {sidebar}
        </aside>

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 top-16 z-20 bg-slate-900/40 lg:hidden"
              onClick={() => setMobileOpen(false)}
              role="presentation"
            />
            <aside className="fixed inset-y-16 left-0 z-20 w-64 overflow-y-auto border-r border-slate-200 bg-white lg:hidden">
              {sidebar}
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
