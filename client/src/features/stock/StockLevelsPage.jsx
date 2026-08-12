import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiSearch, FiDownload, FiFileText } from 'react-icons/fi';

import { stockApi } from '@/api/resources';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatQuantity } from '@/lib/format';
import { exportToExcel, exportToPdf } from '@/lib/export';

const STATE_TONE = { OK: 'success', BELOW_MIN: 'warning', ABOVE_MAX: 'info', OUT_OF_STOCK: 'danger' };

export default function StockLevelsPage() {
  const { t, i18n } = useTranslation(['stock', 'common', 'products']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();

  const [filters, setFilters] = useState({ search: '', warehouseId: '', state: '', page: 1 });

  const levelsQuery = useQuery({
    queryKey: ['stock', 'levels', filters],
    queryFn: () => stockApi.levels({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const label = (row) =>
    lng === 'en' && row.product.designationEn ? row.product.designationEn : row.product.designation;

  const columns = [
    { key: 'reference', header: t('common:fields.reference'), value: (r) => r.product.reference },
    { key: 'designation', header: t('common:fields.designation'), value: label },
    {
      key: 'quantity',
      header: t('stock:levels.quantity'),
      align: 'right',
      sortable: true,
      value: (r) => r.quantity,
      render: (r) => formatQuantity(r.quantity, lng),
    },
    {
      key: 'minThreshold',
      header: t('common:fields.minThreshold'),
      align: 'right',
      value: (r) => r.product.minThreshold,
    },
    {
      key: 'state',
      header: t('stock:levels.state'),
      value: (r) => t(`stock:state.${r.state}`),
      render: (r) => <StatusBadge tone={STATE_TONE[r.state]}>{t(`stock:state.${r.state}`)}</StatusBadge>,
    },
  ];

  const rows = levelsQuery.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('stock:levels.title')}</h1>
          <p className="text-sm text-slate-500">{t('stock:levels.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToExcel({ columns, rows, filename: 'stock', sheetName: t('stock:levels.title') })}
            className="btn-secondary"
          >
            <FiDownload className="size-4" />
            Excel
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() =>
              exportToPdf({ columns, rows, filename: 'stock', title: t('stock:levels.title'), locale: lng })
            }
            className="btn-secondary"
          >
            <FiFileText className="size-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <FiSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            placeholder={t('products:filters.searchPlaceholder')}
            aria-label={t('common:actions.search')}
            className="input pl-9"
          />
        </div>

        <select
          value={filters.state}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value, page: 1 }))}
          aria-label={t('stock:levels.state')}
          className="input w-auto min-w-44"
        >
          <option value="">{t('stock:levels.allStates')}</option>
          {['OK', 'BELOW_MIN', 'ABOVE_MAX', 'OUT_OF_STOCK'].map((s) => (
            <option key={s} value={s}>{t(`stock:state.${s}`)}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        pagination={levelsQuery.data?.pagination}
        isLoading={levelsQuery.isLoading}
        isError={levelsQuery.isError}
        error={levelsQuery.error && translateError(levelsQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        getRowKey={(r) => r.id}
      />
    </div>
  );
}
