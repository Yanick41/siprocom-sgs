import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiCheck, FiShield } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { stockApi, productsApi, warehousesApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatQuantity } from '@/lib/format';

/**
 * Physical inventory correction (§4.4) plus the ledger consistency check.
 *
 * The theoretical figure is shown before the count is entered so the user sees
 * the difference they are about to record, rather than typing blind.
 */
export default function AdjustmentPage() {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { user, can } = useAuth();

  const [form, setForm] = useState({ productId: '', warehouseId: '', countedQuantity: '', reason: '' });
  const [allowNegative, setAllowNegative] = useState(false);

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => warehousesApi.list() });
  const productsQuery = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => productsApi.list({ limit: 200, sort: 'designation', order: 'asc' }),
  });

  const levelQuery = useQuery({
    queryKey: ['stock', 'product', form.productId],
    queryFn: () => stockApi.byProduct(form.productId),
    enabled: Boolean(form.productId),
  });

  const theoretical =
    levelQuery.data?.product?.stockLevels?.find((l) => l.warehouseId === form.warehouseId)?.quantity ?? 0;

  const counted = form.countedQuantity === '' ? null : Number(form.countedQuantity);
  const delta = counted === null ? null : counted - theoretical;

  const mutation = useMutation({
    mutationFn: stockApi.adjust,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(
        t('stock:adjustment.toast.done', {
          delta: result.delta > 0 ? `+${result.delta}` : String(result.delta),
        })
      );
      setForm({ ...form, countedQuantity: '', reason: '' });
      setAllowNegative(false);
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const reconcileMutation = useMutation({
    mutationFn: stockApi.reconcile,
    onSuccess: (report) => {
      if (report.consistent) toast.success(t('stock:reconcile.consistent', { checked: report.checked }));
      else toast.error(t('stock:reconcile.drifted', { drifted: report.drifted, checked: report.checked }));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const canSubmit =
    form.productId && form.warehouseId && counted !== null && form.reason.trim().length >= 3 && delta !== 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t('stock:adjustment.title')}</h1>
        <p className="text-sm text-slate-500">{t('stock:adjustment.subtitle')}</p>
      </header>

      <div className="card max-w-2xl space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="warehouseId" className="label">{t('common:fields.warehouse')}</label>
            <select
              id="warehouseId"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {(warehousesQuery.data?.items || []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="productId" className="label">{t('stock:adjustment.product')}</label>
            <select
              id="productId"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              className="input"
            >
              <option value="">—</option>
              {(productsQuery.data?.items || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} — {lng === 'en' && p.designationEn ? p.designationEn : p.designation}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.productId && form.warehouseId && (
          <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">{t('stock:adjustment.theoretical')}</p>
              <p className="text-lg font-semibold text-slate-900">{formatQuantity(theoretical, lng)}</p>
            </div>
            <div>
              <label htmlFor="counted" className="text-xs text-slate-500">
                {t('stock:adjustment.counted')}
              </label>
              <input
                id="counted"
                type="number"
                min="0"
                value={form.countedQuantity}
                onChange={(e) => setForm({ ...form, countedQuantity: e.target.value })}
                className="input mt-1"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t('stock:adjustment.difference')}</p>
              <p
                className={`text-lg font-semibold ${
                  delta === null || delta === 0
                    ? 'text-slate-400'
                    : delta > 0
                      ? 'text-green-600'
                      : 'text-red-600'
                }`}
              >
                {delta === null ? '—' : delta > 0 ? `+${delta}` : delta}
              </p>
            </div>
          </div>
        )}

        {delta === 0 && counted !== null && (
          <p className="text-sm text-slate-500">{t('stock:adjustment.noDifference')}</p>
        )}

        <div>
          <label htmlFor="reason" className="label">{t('stock:adjustment.reason')}</label>
          <textarea
            id="reason"
            rows={2}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder={t('stock:adjustment.reasonPlaceholder')}
            className="input py-2"
          />
        </div>

        {/* BR-3: only an ADMIN may knowingly drive a level below zero. */}
        {user?.role === 'ADMIN' && delta !== null && delta < 0 && theoretical + delta < 0 && (
          <label className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-50 px-3 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={allowNegative}
              onChange={(e) => setAllowNegative(e.target.checked)}
              className="size-4 rounded"
            />
            {t('stock:issue.allowNegative')}
          </label>
        )}

        <button
          type="button"
          disabled={!canSubmit || mutation.isPending}
          onClick={() =>
            mutation.mutate({
              productId: form.productId,
              warehouseId: form.warehouseId,
              countedQuantity: counted,
              reason: form.reason.trim(),
              allowNegative,
            })
          }
          className="btn-primary w-full"
        >
          <FiCheck className="size-4" />
          {t('stock:adjustment.submit')}
        </button>
      </div>

      {can('stock.cancel') && (
        <div className="card max-w-2xl space-y-3 p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <FiShield className="size-4 text-sgs-accent" />
            {t('stock:reconcile.title')}
          </h2>
          <p className="text-sm text-slate-500">{t('stock:reconcile.description')}</p>
          <button
            type="button"
            disabled={reconcileMutation.isPending}
            onClick={() => reconcileMutation.mutate()}
            className="btn-secondary"
          >
            {t('stock:reconcile.run')}
          </button>
        </div>
      )}
    </div>
  );
}
