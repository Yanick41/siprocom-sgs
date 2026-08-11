import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FiDownload } from 'react-icons/fi';

import { auditApi } from '@/api/resources';
import DataTable from '@/components/DataTable';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDateTime } from '@/lib/format';
import { exportToExcel } from '@/lib/export';

/**
 * The audit trail (§4.7). Read-only: the log is append-only by design, and a
 * screen that could edit it would defeat its purpose.
 */
export default function AuditLogPage() {
  const { t, i18n } = useTranslation(['admin', 'common', 'auth']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();

  const [filters, setFilters] = useState({ action: '', from: '', to: '', page: 1 });

  const actionsQuery = useQuery({ queryKey: ['audit', 'actions'], queryFn: auditApi.actions });
  const logsQuery = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => auditApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const columns = [
    {
      key: 'createdAt',
      header: t('admin:audit.timestamp'),
      sortable: true,
      value: (l) => formatDateTime(l.createdAt, lng),
    },
    {
      key: 'user',
      header: t('admin:audit.user'),
      value: (l) => l.user?.name || '—',
      render: (l) => (
        <div>
          <p className="font-medium text-slate-800">{l.user?.name || '—'}</p>
          <p className="text-xs text-slate-500">{l.user ? t(`auth:roles.${l.user.role}`) : ''}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: t('admin:audit.action'),
      value: (l) => l.action,
      render: (l) => <span className="font-mono text-xs text-slate-700">{l.action}</span>,
    },
    { key: 'entity', header: t('admin:audit.entity'), value: (l) => l.entity || '' },
    { key: 'ipAddress', header: t('admin:audit.ip'), value: (l) => l.ipAddress || '' },
  ];

  const rows = logsQuery.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('admin:audit.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin:audit.subtitle')}</p>
        </div>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => exportToExcel({ columns, rows, filename: 'audit', sheetName: 'Audit' })}
          className="btn-secondary"
        >
          <FiDownload className="size-4" />
          Excel
        </button>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <select
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value, page: 1 }))}
          aria-label={t('admin:audit.action')}
          className="input w-auto min-w-56"
        >
          <option value="">{t('admin:audit.allActions')}</option>
          {(actionsQuery.data?.items || []).map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label htmlFor="from" className="text-sm text-slate-500">{t('common:fields.from')}</label>
          <input
            id="from" type="date" value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
            className="input w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="to" className="text-sm text-slate-500">{t('common:fields.to')}</label>
          <input
            id="to" type="date" value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
            className="input w-auto"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        pagination={logsQuery.data?.pagination}
        isLoading={logsQuery.isLoading}
        isError={logsQuery.isError}
        error={logsQuery.error && translateError(logsQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </div>
  );
}
