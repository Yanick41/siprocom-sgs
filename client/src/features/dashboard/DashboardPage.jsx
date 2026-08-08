import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FiPackage, FiTag, FiTruck, FiHome } from 'react-icons/fi';

import { useAuth } from '@/context/AuthContext';

/**
 * Placeholder until Phase 6 builds the real KPI dashboard (stat cards,
 * 30-day movement curve, trending chart, alert list).
 */
export default function DashboardPage() {
  const { t } = useTranslation(['common', 'auth', 'products', 'admin']);
  const { user } = useAuth();

  const shortcuts = [
    { to: '/products', icon: FiPackage, label: t('common:nav.products'), permission: 'products.view' },
    { to: '/categories', icon: FiTag, label: t('common:nav.categories'), permission: 'categories.view' },
    { to: '/suppliers', icon: FiTruck, label: t('common:nav.suppliers'), permission: 'suppliers.view' },
    { to: '/warehouses', icon: FiHome, label: t('common:nav.warehouses'), permission: 'warehouses.view' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t('common:nav.dashboard')}</h1>
        <p className="text-sm text-slate-500">
          {user?.name} — {t(`auth:roles.${user?.role}`)}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.to}
            to={shortcut.to}
            className="card flex items-center gap-3 p-4 transition-colors hover:border-sgs-accent"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-sgs-navy/10 text-sgs-navy">
              <shortcut.icon className="size-5" />
            </span>
            <span className="font-medium text-slate-800">{shortcut.label}</span>
          </Link>
        ))}
      </div>

      <div className="card p-6">
        <p className="text-sm text-slate-500">
          Phase 2 — {t('common:states.emptyHint')} (KPI: Phase 6)
        </p>
      </div>
    </div>
  );
}
