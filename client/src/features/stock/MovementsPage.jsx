import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiDownload, FiFileText, FiArrowDown, FiArrowUp, FiSliders } from 'react-icons/fi';

import { stockApi } from '@/api/resources';
import DataTable from '@/components/DataTable';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { exportToExcel, exportToPdf } from '@/lib/export';

const TYPE_ICON = { IN: FiArrowDown, OUT: FiArrowUp, ADJUSTMENT: FiSliders };
const TYPE_COLOR = { IN: 'text-emerald-600', OUT: 'text-red-600', ADJUSTMENT: 'text-amber-600' };

/** The journal de stock (§4.4) — append-only, so this screen is read-only by design. */
export default function MovementsPage() {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();

  const [filters, setFilters] = useState({ type: '', from: '', to: '', page: 1 });

  const movementsQuery = useQuery({
    queryKey: ['stock', 'movements', filters],
    queryFn: () => stockApi.movements({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const label = (m) => (lng === 'en' && m.product.designationEn ? m.product.designationEn : m.product.designation);

  const columns = [
    {
      key: 'createdAt',
      header: t('common:fields.date'),
      sortable: true,
      value: (m) => formatDateTime(m.createdAt, lng),
    },
    {
      key: 'type',
      header: t('common:fields.type'),
      value: (m) => t(`stock:movementType.${m.type}`),
      render: (m) => {
        const Icon = TYPE_ICON[m.type];
        return (
          <span className={`inline-flex items-center gap-1.5 font-medium ${TYPE_COLOR[m.type]}`}>
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`stock:movementType.${m.type}`)}
          </span>
        );
      },
    },
    { key: 'reference', header: t('common:fields.reference'), value: (m) => m.product.reference },
    { key: 'designation', header: t('common:fields.designation'), value: label },
    {
      key: 'quantity',
      header: t('common:fields.quantity'),
      align: 'right',
      value: (m) => (m.type === 'OUT' ? -m.quantity : m.quantity),
      render: (m) => (
        <span className={`font-medium ${TYPE_COLOR[m.type]}`}>
          {m.type === 'OUT' ? '−' : m.quantity < 0 ? '−' : '+'}
          {formatQuantity(Math.abs(m.quantity), lng)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: t('stock:movements.balanceAfter'),
      align: 'right',
      value: (m) => m.balanceAfter,
      render: (m) => formatQuantity(m.balanceAfter, lng),
    },
    { key: 'reason', header: t('common:fields.reason'), value: (m) => m.reason || '' },
    { key: 'user', header: t('stock:movements.user'), value: (m) => m.user?.name || '' },
  ];

  const rows = movementsQuery.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('stock:movements.title')}</h1>
          <p className="text-sm text-slate-500">{t('stock:movements.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToExcel({ columns, rows, filename: 'mouvements', sheetName: 'Mouvements' })}
            className="btn-secondary"
          >
            <FiDownload className="size-4" />
            Excel
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportToPdf({ columns, rows, filename: 'mouvements', title: t('stock:movements.title'), locale: lng })
            }
            className="btn-secondary"
          >
            <FiFileText className="size-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}
          aria-label={t('common:fields.type')}
          className="input w-auto min-w-40"
        >
          <option value="">{t('stock:movements.allTypes')}</option>
          {['IN', 'OUT', 'ADJUSTMENT'].map((type) => (
            <option key={type} value={type}>{t(`stock:movementType.${type}`)}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label htmlFor="from" className="text-sm text-slate-500">{t('common:fields.from')}</label>
          <input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
            className="input w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="to" className="text-sm text-slate-500">{t('common:fields.to')}</label>
          <input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
            className="input w-auto"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        pagination={movementsQuery.data?.pagination}
        isLoading={movementsQuery.isLoading}
        isError={movementsQuery.isError}
        error={movementsQuery.error && translateError(movementsQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        emptyMessage={t('stock:movements.empty')}
      />
    </div>
  );
}
