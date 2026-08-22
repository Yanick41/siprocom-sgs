import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiPlus, FiCheck, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { receiptsApi, productsApi, suppliersApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { PermissionGate } from '@/components/ProtectedRoute';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDate, formatCurrency, formatQuantity } from '@/lib/format';
import DocumentLinesEditor from './DocumentLinesEditor';

const STATUS_TONE = { DRAFT: 'neutral', VALIDATED: 'success', CANCELLED: 'danger' };

export default function ReceiptsPage() {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can } = useAuth();

  const [filters, setFilters] = useState({ status: '', page: 1 });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);

  const listQuery = useQuery({
    queryKey: ['receipts', filters],
    queryFn: () => receiptsApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['receipts'] });
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const validateMutation = useMutation({
    mutationFn: receiptsApi.validate,
    onSuccess: () => {
      refresh();
      setViewing(null);
      toast.success(t('stock:receipt.toast.validated'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: receiptsApi.cancel,
    onSuccess: () => {
      refresh();
      setViewing(null);
      toast.success(t('stock:document.toast.cancelled'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const columns = [
    { key: 'number', header: t('stock:document.number'), render: (d) => <span className="font-mono text-xs font-medium">{d.number}</span> },
    { key: 'receiptDate', header: t('common:fields.date'), sortable: true, render: (d) => formatDate(d.receiptDate, lng) },
    { key: 'supplier', header: t('stock:receipt.supplier'), render: (d) => d.supplier?.name || '—' },
    { key: 'reason', header: t('common:fields.reason'), render: (d) => t(`stock:receiptReason.${d.reason}`) },
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
          <h1 className="text-xl font-bold text-slate-900">{t('stock:receipt.title')}</h1>
          <p className="text-sm text-slate-500">{t('stock:receipt.subtitle')}</p>
        </div>
        <PermissionGate permission="stock.write">
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <FiPlus className="size-4" />
            {t('stock:receipt.new')}
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
            {status ? t(`stock:status.${status}`) : t('common:filters.all')}
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
        <ReceiptFormModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
            toast.success(t('stock:receipt.toast.created'));
          }}
        />
      )}

      {viewing && (
        <ReceiptDetailModal
          id={viewing}
          onClose={() => setViewing(null)}
          canValidate={can('stock.validate')}
          canCancel={can('stock.cancel')}
          onValidate={() => validateMutation.mutate(viewing)}
          onCancel={(reason) => cancelMutation.mutate({ id: viewing, reason })}
          isPending={validateMutation.isPending || cancelMutation.isPending}
        />
      )}
    </div>
  );
}

function ReceiptFormModal({ onClose, onCreated }) {
  const { t } = useTranslation(['stock', 'common']);
  const translateError = useErrorMessage();

  const [form, setForm] = useState({ supplierId: '', reason: 'PURCHASE', purchaseOrderRef: '' });
  const [lines, setLines] = useState([{ productId: '', quantity: 1, unitPrice: 0 }]);
  const [submitError, setSubmitError] = useState(null);

  const suppliersQuery = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => suppliersApi.list({ limit: 200 }) });
  const productsQuery = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => productsApi.list({ limit: 200, sort: 'designation', order: 'asc' }),
  });

  const mutation = useMutation({ mutationFn: receiptsApi.create, onSuccess: onCreated, onError: setSubmitError });

  const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const total = validLines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice || 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('stock:receipt.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button
            type="button"
            disabled={validLines.length === 0 || mutation.isPending}
            onClick={() => {
              setSubmitError(null);
              mutation.mutate({
                supplierId: form.supplierId || null,
                reason: form.reason,
                purchaseOrderRef: form.purchaseOrderRef || null,
                lines: validLines.map((l) => ({
                  productId: l.productId,
                  quantity: Number(l.quantity),
                  packaging: l.packaging ?? 'UNIT',
                  unitPrice: Number(l.unitPrice || 0),
                })),
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
            <label htmlFor="supplierId" className="label">{t('stock:receipt.supplier')}</label>
            <select
              id="supplierId"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {(suppliersQuery.data?.items || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason" className="label">{t('common:fields.reason')}</label>
            <select
              id="reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input"
            >
              {['PURCHASE', 'RETURN_CUSTOMER', 'ADJUSTMENT'].map((r) => (
                <option key={r} value={r}>{t(`stock:receiptReason.${r}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="purchaseOrderRef" className="label">{t('stock:receipt.purchaseOrderRef')}</label>
            <input
              id="purchaseOrderRef"
              type="text"
              value={form.purchaseOrderRef}
              onChange={(e) => setForm({ ...form, purchaseOrderRef: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
          <p className="label">{t('stock:document.lines')}</p>
          <DocumentLinesEditor
            lines={lines}
            onChange={setLines}
            products={productsQuery.data?.items || []}
            withPrice
          />
        </div>

        <p className="text-right text-sm font-medium text-slate-700">
          {t('stock:receipt.totalValue')} : {formatCurrency(total)}
        </p>
      </div>
    </Modal>
  );
}

function ReceiptDetailModal({ id, onClose, canValidate, canCancel, onValidate, onCancel, isPending }) {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const query = useQuery({ queryKey: ['receipts', id], queryFn: () => receiptsApi.get(id) });
  const doc = query.data;

  const total = doc?.lines?.reduce((sum, l) => sum + l.quantity * Number(l.unitPrice || 0), 0) ?? 0;

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
              <button type="button" disabled={isPending} onClick={onValidate} className="btn-primary">
                <FiCheck className="size-4" />
                {t('stock:receipt.validate')}
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
              <dd><StatusBadge tone={STATUS_TONE[doc.status]}>{t(`stock:status.${doc.status}`)}</StatusBadge></dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('common:fields.date')}</dt>
              <dd className="text-slate-800">{formatDate(doc.receiptDate, lng)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('stock:receipt.supplier')}</dt>
              <dd className="text-slate-800">{doc.supplier?.name || '—'}</dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">{t('common:fields.designation')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('common:fields.quantity')}</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">{t('stock:receipt.unitPrice')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 text-slate-700">
                      <span className="font-mono text-xs text-slate-400">{line.product.reference}</span>{' '}
                      {lng === 'en' && line.product.designationEn ? line.product.designationEn : line.product.designation}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatQuantity(line.quantity, lng)}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatCurrency(line.unitPrice, lng)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right font-medium text-slate-600">
                    {t('stock:receipt.totalValue')}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {formatCurrency(total, lng)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
