import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { FiPackage, FiBell, FiActivity, FiDollarSign, FiArrowRight } from 'react-icons/fi';

import { reportsApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatCurrency, formatQuantity, formatDate, formatDateTime } from '@/lib/format';
import StatusBadge from '@/components/StatusBadge';

// Two hues that stay distinguishable in greyscale and for the most common
// colour-vision deficiencies — receipts and issues are read side by side.
const COLOR_IN = '#0f766e';
const COLOR_OUT = '#b45309';

function StatCard({ icon: Icon, label, value, tone = 'navy', to }) {
  const content = (
    <div className="card flex items-center gap-4 p-4">
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
          tone === 'danger' ? 'bg-red-50 text-sgs-danger' : 'bg-sgs-navy/10 text-sgs-navy'
        }`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="truncate text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block transition-transform hover:-translate-y-0.5">{content}</Link>
  ) : (
    content
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation(['reports', 'common', 'stock', 'auth']);
  const lng = i18n.resolvedLanguage;
  const { user, can } = useAuth();
  const translateError = useErrorMessage();

  const query = useQuery({ queryKey: ['reports', 'dashboard'], queryFn: () => reportsApi.dashboard() });

  if (query.isLoading) {
    return <p className="p-8 text-center text-slate-500">{t('common:states.loading')}</p>;
  }
  if (query.isError) {
    return <p className="p-8 text-center text-sgs-danger">{translateError(query.error)}</p>;
  }

  const { kpis, trending, curve, lowStock, recentMovements } = query.data;
  const label = (p) => (lng === 'en' && p.designationEn ? p.designationEn : p.designation);

  const curveData = curve.map((point) => ({
    ...point,
    label: formatDate(point.label, lng, { day: '2-digit', month: '2-digit' }),
  }));

  const trendingData = trending.map((p) => ({ name: p.reference, value: p.totalOut, full: label(p) }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t('common:nav.dashboard')}</h1>
        <p className="text-sm text-slate-500">
          {user?.name} — {t(`auth:roles.${user?.role}`)}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FiPackage} label={t('reports:kpi.products')} value={kpis.productCount} to="/products" />
        <StatCard
          icon={FiBell}
          label={t('reports:kpi.openAlerts')}
          value={kpis.openAlerts}
          tone={kpis.openAlerts > 0 ? 'danger' : 'navy'}
          to="/alerts"
        />
        <StatCard
          icon={FiActivity}
          label={t('reports:kpi.movementsToday')}
          value={kpis.movementsToday}
          to="/movements"
        />
        {/* Stock value is financial data — ADMIN and DIRECTION only (§3). */}
        {can('reports.valuation') ? (
          <StatCard icon={FiDollarSign} label={t('reports:kpi.stockValue')} value={formatCurrency(kpis.stockValue, lng)} />
        ) : (
          <StatCard
            icon={FiPackage}
            label={t('reports:kpi.totalQuantity')}
            value={formatQuantity(kpis.totalQuantity, lng)}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{t('reports:chart.movements30d')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  labelStyle={{ color: '#0f172a', fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone" dataKey="totalIn" name={t('stock:movementType.IN')}
                  stroke={COLOR_IN} strokeWidth={2} dot={false}
                />
                <Line
                  type="monotone" dataKey="totalOut" name={t('stock:movementType.OUT')}
                  stroke={COLOR_OUT} strokeWidth={2} dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{t('reports:chart.trending')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendingData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category" dataKey="name" width={70}
                  tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(value, _name, entry) => [value, entry.payload.full]}
                />
                <Bar dataKey="value" name={t('reports:chart.quantityOut')} fill={COLOR_OUT} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">{t('reports:lowStock.title')}</h2>
            <Link to="/alerts" className="flex items-center gap-1 text-sm text-sgs-accent hover:underline">
              {t('common:actions.viewAll')}
              <FiArrowRight className="size-3.5" />
            </Link>
          </header>
          {lowStock.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('reports:lowStock.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{label(item)}</p>
                    <p className="text-xs text-slate-500">{item.reference}</p>
                  </div>
                  <StatusBadge tone={item.quantity <= 0 ? 'danger' : 'warning'}>
                    {formatQuantity(item.quantity, lng)} / {item.minThreshold}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">{t('reports:recentMovements')}</h2>
            <Link to="/movements" className="flex items-center gap-1 text-sm text-sgs-accent hover:underline">
              {t('common:actions.viewAll')}
              <FiArrowRight className="size-3.5" />
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {recentMovements.map((movement) => (
              <li key={movement.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{label(movement.product)}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(movement.createdAt, lng)} — {movement.user?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    movement.type === 'OUT' ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {movement.type === 'OUT' ? '−' : '+'}
                  {formatQuantity(Math.abs(movement.quantity), lng)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
