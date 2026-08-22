import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiDownload, FiFileText, FiCheck, FiTrendingDown, FiTrendingUp } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { alertsApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDateTime, formatQuantity } from '@/lib/format';
import { exportToExcel, exportToPdf } from '@/lib/export';

const STATUS_TONE = { OPEN: 'danger', ACKNOWLEDGED: 'warning', RESOLVED: 'success' };

export default function AlertsPage() {
  const { t, i18n } = useTranslation(['alerts', 'common', 'stock']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can } = useAuth();

  const [filters, setFilters] = useState({ status: 'OPEN', type: '', page: 1 });

  const alertsQuery = useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => alertsApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: alertsApi.acknowledge,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(t('alerts:toast.acknowledged'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const label = (a) => (lng === 'en' && a.product.designationEn ? a.product.designationEn : a.product.designation);

  const columns = [
    {
      key: 'type',
      header: t('common:fields.type'),
      value: (a) => t(`alerts:type.${a.type}`),
      render: (a) => (
        <span
          className={`inline-flex items-center gap-1.5 font-medium ${
            a.type === 'MIN_THRESHOLD' ? 'text-red-600' : 'text-sky-600'
          }`}
        >
          {a.type === 'MIN_THRESHOLD' ? (
            <FiTrendingDown className="size-3.5" aria-hidden="true" />
          ) : (
            <FiTrendingUp className="size-3.5" aria-hidden="true" />
          )}
          {t(`alerts:type.${a.type}`)}
        </span>
      ),
    },
    { key: 'reference', header: t('common:fields.reference'), value: (a) => a.product.reference },
    { key: 'designation', header: t('common:fields.designation'), value: label },
    {
      key: 'currentQuantity',
      header: t('alerts:currentQuantity'),
      align: 'right',
      value: (a) => a.currentQuantity,
      render: (a) => (
        <span className="font-medium text-slate-900">{formatQuantity(a.currentQuantity, lng)}</span>
      ),
    },
    {
      key: 'thresholdValue',
      header: t('alerts:threshold'),
      align: 'right',
      value: (a) => a.thresholdValue,
    },
    {
      key: 'createdAt',
      header: t('alerts:triggeredAt'),
      sortable: true,
      value: (a) => formatDateTime(a.createdAt, lng),
    },
    {
      key: 'status',
      header: t('common:fields.status'),
      value: (a) => t(`alerts:status.${a.status}`),
      render: (a) => (
        <div className="flex items-center gap-2">
          <StatusBadge tone={STATUS_TONE[a.status]}>{t(`alerts:status.${a.status}`)}</StatusBadge>
          {a.status === 'OPEN' && can('alerts.acknowledge') && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                acknowledgeMutation.mutate(a.id);
              }}
              className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
              aria-label={t('alerts:acknowledge')}
              title={t('alerts:acknowledge')}
            >
              <FiCheck className="size-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const rows = alertsQuery.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('alerts:title')}</h1>
          <p className="text-sm text-slate-500">{t('alerts:subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToExcel({ columns, rows, filename: 'alertes', sheetName: t('alerts:title') })}
            className="btn-secondary"
          >
            <FiDownload className="size-4" />
            Excel
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportToPdf({ columns, rows, filename: 'alertes', title: t('alerts:title'), locale: lng })}
            className="btn-secondary"
          >
            <FiFileText className="size-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          aria-label={t('common:fields.status')}
          className="input w-auto min-w-40"
        >
          {['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'all'].map((status) => (
            <option key={status} value={status}>
              {status === 'all' ? t('common:filters.all') : t(`alerts:status.${status}`)}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))}
          aria-label={t('common:fields.type')}
          className="input w-auto min-w-44"
        >
          <option value="">{t('alerts:allTypes')}</option>
          <option value="MIN_THRESHOLD">{t('alerts:type.MIN_THRESHOLD')}</option>
          <option value="MAX_THRESHOLD">{t('alerts:type.MAX_THRESHOLD')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        pagination={alertsQuery.data?.pagination}
        isLoading={alertsQuery.isLoading}
        isError={alertsQuery.isError}
        error={alertsQuery.error && translateError(alertsQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        emptyMessage={t('alerts:empty')}
      />
    </div>
  );
}
