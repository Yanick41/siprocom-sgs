import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiPlus, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { issuesApi, productsApi, warehousesApi, stockApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { PermissionGate } from '@/components/ProtectedRoute';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDate, formatQuantity } from '@/lib/format';
import DocumentLinesEditor from './DocumentLinesEditor';

const STATUS_TONE = { DRAFT: 'neutral', VALIDATED: 'success', CANCELLED: 'danger' };

export default function IssuesPage() {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can, user } = useAuth();

  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);

  const listQuery = useQuery({
    queryKey: ['issues', filters],
    queryFn: () => issuesApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['issues'] });
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const validateMutation = useMutation({
    mutationFn: issuesApi.validate,
    onSuccess: () => {
      refresh();
      setViewing(null);
      toast.success(t('stock:issue.toast.validated'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: issuesApi.cancel,
    onSuccess: () => {
      refresh();
      setViewing(null);
      toast.success(t('stock:document.toast.cancelled'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const columns = [
    { key: 'number', header: t('stock:document.number'), render: (d) => <span className="font-mono text-xs font-medium">{d.number}</span> },
    { key: 'issueDate', header: t('common:fields.date'), sortable: true, render: (d) => formatDate(d.issueDate, lng) },
    { key: 'warehouse', header: t('common:fields.warehouse'), render: (d) => d.warehouse?.name },
    {
      key: 'reason',
      header: t('common:fields.reason'),
      render: (d) => (
        <span>
          {t(`stock:issueReason.${d.reason}`)}
          {d.reason === 'TRANSFER' && d.destWarehouse && (
            <span className="text-slate-400"> → {d.destWarehouse.name}</span>
          )}
        </span>
      ),
    },
    { key: 'recipient', header: t('stock:issue.recipient'), render: (d) => d.recipient || '—' },
    { key: 'lines', header: t('stock:document.lineCount'), align: 'right', render: (d) => d._count?.lines ?? 0 },
    {
      key: 'status',
      header: t('common:fields.status'),
      render: (d) => <StatusBadge tone={STATUS_TONE[d.status]}>{t(`stock:status.${d.status}`)}</StatusBadge>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('stock:issue.title')}</h1>
          <p className="text-sm text-slate-500">{t('stock:issue.subtitle')}</p>
        </div>
        <PermissionGate permission="stock.write">
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <FiPlus className="size-4" />
            {t('stock:issue.new')}
          </button>
        </PermissionGate>
      </div>

      <div className="card flex flex-wrap gap-2 p-3">
        {['', 'DRAFT', 'VALIDATED', 'CANCELLED'].map((status) => (
          <button
            key={status || 'all'}
            type="button"
            onClick={() => setFilters({ status, page: 1 })}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
              filters.status === status ? 'bg-sgs-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {status ? t(`stock:status.${status}`) : t('common:filters.all', { defaultValue: 'Tous' })}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={listQuery.data?.items || []}
        pagination={listQuery.data?.pagination}
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        error={listQuery.error && translateError(listQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        onRowClick={(row) => setViewing(row.id)}
      />

      {creating && (
        <IssueFormModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
            toast.success(t('stock:issue.toast.created'));
          }}
        />
      )}

      {viewing && (
        <IssueDetailModal
          id={viewing}
          onClose={() => setViewing(null)}
          canValidate={can('stock.validate')}
          canCancel={can('stock.cancel')}
          isAdmin={user?.role === 'ADMIN'}
          onValidate={(allowNegative) => validateMutation.mutate({ id: viewing, allowNegative })}
          onCancel={(reason) => cancelMutation.mutate({ id: viewing, reason })}
          isPending={validateMutation.isPending || cancelMutation.isPending}
        />
      )}
    </div>
  );
}

function IssueFormModal({ onClose, onCreated }) {
  const { t } = useTranslation(['stock', 'common']);
  const translateError = useErrorMessage();

  const [form, setForm] = useState({
    warehouseId: '',
    destWarehouseId: '',
    reason: 'SALE',
    recipient: '',
    notes: '',
  });
  const [lines, setLines] = useState([{ productId: '', quantity: 1 }]);
  const [submitError, setSubmitError] = useState(null);

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => warehousesApi.list() });
  const productsQuery = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => productsApi.list({ limit: 200, sort: 'designation', order: 'asc' }),
  });

  // Live availability for the selected source warehouse.
  const levelsQuery = useQuery({
    queryKey: ['stock', 'levels', form.warehouseId],
    queryFn: () => stockApi.levels({ warehouseId: form.warehouseId, limit: 200 }),
    enabled: Boolean(form.warehouseId),
  });

  const availability = new Map(
    (levelsQuery.data?.items || []).map((level) => [level.productId, level.quantity])
  );

  const mutation = useMutation({
    mutationFn: issuesApi.create,
    onSuccess: onCreated,
    onError: setSubmitError,
  });

  const isTransfer = form.reason === 'TRANSFER';
  const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const canSubmit = form.warehouseId && validLines.length > 0 && (!isTransfer || form.destWarehouseId);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('stock:issue.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => {
              setSubmitError(null);
              mutation.mutate({
                warehouseId: form.warehouseId,
                reason: form.reason,
                recipient: form.recipient || null,
                destWarehouseId: isTransfer ? form.destWarehouseId : null,
                notes: form.notes || null,
                lines: validLines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
              });
            }}
            className="btn-primary"
          >
            {t('stock:document.saveDraft')}
          </button>
        </>
      }
    >
      {submitError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {translateError(submitError)}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="warehouseId" className="label">
              {t('stock:issue.sourceWarehouse')}
            </label>
            <select
              id="warehouseId"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {(warehousesQuery.data?.items || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason" className="label">
              {t('common:fields.reason')}
            </label>
            <select
              id="reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input"
            >
              {['SALE', 'TRANSFER', 'DAMAGE', 'SAMPLE', 'INTERNAL', 'RETURN_SUPPLIER', 'OTHER'].map((r) => (
                <option key={r} value={r}>
                  {t(`stock:issueReason.${r}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isTransfer ? (
          <div>
            <label htmlFor="destWarehouseId" className="label">
              {t('stock:issue.destWarehouse')}
            </label>
            <select
              id="destWarehouseId"
              value={form.destWarehouseId}
              onChange={(e) => setForm({ ...form, destWarehouseId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {(warehousesQuery.data?.items || [])
                .filter((w) => w.id !== form.warehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="recipient" className="label">
              {t('stock:issue.recipient')}
            </label>
            <input
              id="recipient"
              type="text"
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              className="input"
            />
          </div>
        )}

        <div>
          <p className="label">{t('stock:document.lines')}</p>
          <DocumentLinesEditor
            lines={lines}
            onChange={setLines}
            products={productsQuery.data?.items || []}
            availability={form.warehouseId ? availability : null}
          />
        </div>
      </div>
    </Modal>
  );
}

function IssueDetailModal({ id, onClose, canValidate, canCancel, isAdmin, onValidate, onCancel, isPending }) {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const [allowNegative, setAllowNegative] = useState(false);

  const query = useQuery({ queryKey: ['issues', id], queryFn: () => issuesApi.get(id) });
  const doc = query.data;

  const hasShortage = doc?.lines?.some((line) => line.sufficient === false);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={doc?.number || t('common:states.loading')}
      footer={
        doc && (
          <>
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('common:actions.close')}
            </button>
            {doc.status === 'VALIDATED' && canCancel && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const reason = window.prompt(t('stock:document.cancelReasonPrompt'));
                  if (reason && reason.trim().length >= 3) onCancel(reason.trim());
                }}
                className="btn-danger"
              >
                <FiX className="size-4" />
                {t('stock:document.cancel')}
              </button>
            )}
            {doc.status === 'DRAFT' && canValidate && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onValidate(allowNegative)}
                className="btn-primary"
              >
                <FiCheck className="size-4" />
                {t('stock:issue.validate')}
              </button>
            )}
          </>
        )
      }
    >
      {query.isLoading && <p className="text-slate-500">{t('common:states.loading')}</p>}

      {doc && (
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{t('common:fields.status')}</dt>
              <dd>
                <StatusBadge tone={STATUS_TONE[doc.status]}>{t(`stock:status.${doc.status}`)}</StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common:fields.date')}</dt>
              <dd className="text-slate-800">{formatDate(doc.issueDate, lng)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common:fields.warehouse')}</dt>
              <dd className="text-slate-800">{doc.warehouse?.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common:fields.reason')}</dt>
              <dd className="text-slate-800">
                {t(`stock:issueReason.${doc.reason}`)}
                {doc.destWarehouse && ` → ${doc.destWarehouse.name}`}
              </dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('common:fields.designation')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('common:fields.quantity')}</th>
                  {doc.status === 'DRAFT' && (
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('stock:issue.available')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.lines.map((line) => (
                  <tr key={line.id} className={line.sufficient === false ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="font-mono text-xs text-slate-400">{line.product.reference}</span>{' '}
                      {lng === 'en' && line.product.designationEn ? line.product.designationEn : line.product.designation}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatQuantity(line.quantity, lng)}</td>
                    {doc.status === 'DRAFT' && (
                      <td
                        className={`px-3 py-2 text-right ${
                          line.sufficient === false ? 'font-medium text-sgs-danger' : 'text-slate-500'
                        }`}
                      >
                        {formatQuantity(line.available ?? 0, lng)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* BR-3: the override is deliberate, admin-only, and audited. */}
          {doc.status === 'DRAFT' && hasShortage && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">{t('stock:issue.shortageWarning')}</p>
              {isAdmin && (
                <label className="mt-2 flex min-h-11 items-center gap-2 text-amber-900">
                  <input
                    type="checkbox"
                    checked={allowNegative}
                    onChange={(e) => setAllowNegative(e.target.checked)}
                    className="size-4 rounded"
                  />
                  {t('stock:issue.allowNegative')}
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
