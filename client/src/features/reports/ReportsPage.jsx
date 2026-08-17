import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { FiDownload, FiFileText } from 'react-icons/fi';

import { reportsApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import DataTable from '@/components/DataTable';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatCurrency, formatQuantity, formatDate } from '@/lib/format';
import { exportToExcel, exportToPdf } from '@/lib/export';

const COLOR_IN = '#0f766e';
const COLOR_OUT = '#b45309';

/** Default period: the last 30 days, as ISO strings for <input type="date">. */
const isoDaysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default function ReportsPage() {
  const { t, i18n } = useTranslation(['reports', 'common', 'stock']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();
  const { can } = useAuth();

  const [tab, setTab] = useState('trending');
  const [period, setPeriod] = useState({ from: isoDaysAgo(30), to: new Date().toISOString().slice(0, 10) });
  const params = { ...period };
  const trendingQuery = useQuery({
    queryKey: ['reports', 'trending', params],
    queryFn: () => reportsApi.trending({ ...params, limit: 50 }),
    enabled: tab === 'trending',
  });
  const dormantQuery = useQuery({
    queryKey: ['reports', 'dormant', params],
    queryFn: () => reportsApi.dormant({ ...params, limit: 100 }),
    enabled: tab === 'dormant',
  });
  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', params],
    queryFn: () => reportsApi.movementsSummary({ ...params, groupBy: 'category' }),
    enabled: tab === 'summary',
  });
  const valuationQuery = useQuery({
    queryKey: ['reports', 'valuation'],
    queryFn: () => reportsApi.valuation(),
    enabled: tab === 'valuation' && can('reports.valuation'),
  });

  const label = (p) => (lng === 'en' && p.designationEn ? p.designationEn : p.designation);

  const TABS = [
    { id: 'trending', label: t('reports:tab.trending') },
    { id: 'dormant', label: t('reports:tab.dormant') },
    { id: 'summary', label: t('reports:tab.summary') },
    ...(can('reports.valuation') ? [{ id: 'valuation', label: t('reports:tab.valuation') }] : []),
  ];

  const COLUMNS = {
    trending: [
      { key: 'reference', header: t('common:fields.reference'), value: (r) => r.reference },
      { key: 'designation', header: t('common:fields.designation'), value: label },
      { key: 'categoryName', header: t('common:fields.category'), value: (r) => r.categoryName || '' },
      { key: 'totalOut', header: t('reports:column.totalOut'), align: 'right', value: (r) => r.totalOut },
      { key: 'movementCount', header: t('reports:column.movementCount'), align: 'right', value: (r) => r.movementCount },
      { key: 'avgDailyOut', header: t('reports:column.avgDailyOut'), align: 'right', value: (r) => r.avgDailyOut },
    ],
    dormant: [
      { key: 'reference', header: t('common:fields.reference'), value: (r) => r.reference },
      { key: 'designation', header: t('common:fields.designation'), value: label },
      { key: 'categoryName', header: t('common:fields.category'), value: (r) => r.categoryName || '' },
      { key: 'totalOut', header: t('reports:column.totalOut'), align: 'right', value: (r) => r.totalOut },
      { key: 'currentStock', header: t('reports:column.currentStock'), align: 'right', value: (r) => r.currentStock },
      {
        key: 'lastMovement',
        header: t('reports:column.lastMovement'),
        value: (r) => (r.lastMovement ? formatDate(r.lastMovement, lng) : t('reports:never')),
      },
      {
        key: 'tiedUpValue',
        header: t('reports:column.tiedUpValue'),
        align: 'right',
        value: (r) => Math.round(r.tiedUpValue),
        render: (r) => formatCurrency(r.tiedUpValue, lng),
      },
    ],
    summary: [
      { key: 'label', header: t('common:fields.category'), value: (r) => r.label },
      { key: 'totalIn', header: t('stock:movementType.IN'), align: 'right', value: (r) => r.totalIn },
      { key: 'totalOut', header: t('stock:movementType.OUT'), align: 'right', value: (r) => r.totalOut },
    ],
    valuation: [
      { key: 'categoryName', header: t('common:fields.category'), value: (r) => r.categoryName },
      { key: 'productCount', header: t('reports:column.productCount'), align: 'right', value: (r) => r.productCount },
      { key: 'totalQuantity', header: t('reports:column.totalQuantity'), align: 'right', value: (r) => r.totalQuantity },
      {
        key: 'buyValue',
        header: t('reports:column.buyValue'),
        align: 'right',
        value: (r) => Math.round(r.buyValue),
        render: (r) => formatCurrency(r.buyValue, lng),
      },
      {
        key: 'sellValue',
        header: t('reports:column.sellValue'),
        align: 'right',
        value: (r) => Math.round(r.sellValue),
        render: (r) => formatCurrency(r.sellValue, lng),
      },
    ],
  };

  const ACTIVE = {
    trending: { query: trendingQuery, rows: trendingQuery.data?.items || [] },
    dormant: { query: dormantQuery, rows: dormantQuery.data?.items || [] },
    summary: { query: summaryQuery, rows: summaryQuery.data?.items || [] },
    valuation: { query: valuationQuery, rows: valuationQuery.data?.byCategory || [] },
  }[tab];

  const columns = COLUMNS[tab];
  const rows = ACTIVE.rows;
  const periodLabel = `${formatDate(period.from, lng)} — ${formatDate(period.to, lng)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('reports:title')}</h1>
          <p className="text-sm text-slate-500">{t('reports:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToExcel({ columns, rows, filename: `rapport-${tab}`, sheetName: TABS.find((x) => x.id === tab).label })}
            className="btn-secondary"
          >
            <FiDownload className="size-4" />
            Excel
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportToPdf({
                columns,
                rows,
                filename: `rapport-${tab}`,
                title: TABS.find((x) => x.id === tab).label,
                subtitle: tab === 'valuation' ? undefined : periodLabel,
                locale: lng,
              })
            }
            className="btn-secondary"
          >
            <FiFileText className="size-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
              tab === item.id ? 'bg-sgs-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        {/* Valuation is a snapshot of stock right now — a period would be meaningless. */}
        {tab !== 'valuation' && (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="from" className="text-sm text-slate-500">{t('common:fields.from')}</label>
              <input
                id="from" type="date" value={period.from}
                onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
                className="input w-auto"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="to" className="text-sm text-slate-500">{t('common:fields.to')}</label>
              <input
                id="to" type="date" value={period.to}
                onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
                className="input w-auto"
              />
            </div>
            <div className="flex gap-1">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPeriod({ from: isoDaysAgo(days), to: new Date().toISOString().slice(0, 10) })}
                  className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm text-slate-600 hover:bg-slate-200"
                >
                  {t('reports:lastDays', { days })}
                </button>
              ))}
            </div>
          </>
        )}

      </div>

      {tab === 'summary' && rows.length > 0 && (
        <div className="card p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="totalIn" name={t('stock:movementType.IN')} fill={COLOR_IN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalOut" name={t('stock:movementType.OUT')} fill={COLOR_OUT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={ACTIVE.query.isLoading}
        isError={ACTIVE.query.isError}
        error={ACTIVE.query.error && translateError(ACTIVE.query.error)}
        getRowKey={(row, index) => row.id ?? row.label ?? row.categoryName ?? index}
      />

      {tab === 'valuation' && valuationQuery.data && (
        <div className="card flex flex-wrap justify-end gap-8 p-4 text-sm">
          <div>
            <p className="text-slate-500">{t('reports:column.totalQuantity')}</p>
            <p className="text-lg font-bold text-slate-900">
              {formatQuantity(valuationQuery.data.totals.totalQuantity, lng)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">{t('reports:column.buyValue')}</p>
            <p className="text-lg font-bold text-slate-900">
              {formatCurrency(valuationQuery.data.totals.buyValue, lng)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">{t('reports:column.sellValue')}</p>
            <p className="text-lg font-bold text-sgs-accent">
              {formatCurrency(valuationQuery.data.totals.sellValue, lng)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
