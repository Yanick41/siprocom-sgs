import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FiGrid, FiPackage, FiTag, FiTruck, FiHome, FiLogIn, FiLogOut, FiRepeat,
  FiClipboard, FiBell, FiBarChart2, FiUsers, FiShield, FiSettings, FiMenu, FiX,
} from 'react-icons/fi';

import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

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
      { to: '/transfers', labelKey: 'nav.transfers', icon: FiRepeat, permission: 'stock.view' },
      { to: '/adjustments', labelKey: 'nav.adjustments', icon: FiClipboard, permission: 'stock.write' },
      { to: '/stock', labelKey: 'nav.stock', icon: FiBarChart2, permission: 'stock.view' },
    ],
  },
  {
    titleKey: 'nav.products',
    items: [
      { to: '/products', labelKey: 'nav.products', icon: FiPackage, permission: 'products.view' },
      { to: '/categories', labelKey: 'nav.categories', icon: FiTag, permission: 'categories.view' },
      { to: '/suppliers', labelKey: 'nav.suppliers', icon: FiTruck, permission: 'suppliers.view' },
      { to: '/warehouses', labelKey: 'nav.warehouses', icon: FiHome, permission: 'warehouses.view' },
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
      { to: '/settings', labelKey: 'nav.settings', icon: FiSettings, permission: 'settings.manage' },
    ],
  },
];

export default function AppLayout() {
  const { t } = useTranslation(['common', 'auth']);
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

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
                    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sgs-navy text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
              <p className="font-bold leading-tight text-sgs-navy">{t('common:app.name')}</p>
              <p className="hidden text-xs leading-tight text-slate-500 sm:block">
                {t('common:app.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
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
