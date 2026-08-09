import { useTranslation } from 'react-i18next';
import { FiTrash2, FiPlus, FiAlertTriangle } from 'react-icons/fi';

import { formatQuantity } from '@/lib/format';

/**
 * Editable product lines shared by receipts and issues.
 *
 * When `availability` is supplied (issues), each line is checked live against
 * the warehouse level — a magasinier should see the problem while typing, not
 * discover it when validation is refused.
 */
export default function DocumentLinesEditor({
  lines,
  onChange,
  products,
  withPrice = false,
  availability = null,
}) {
  const { t, i18n } = useTranslation(['stock', 'common']);
  const lng = i18n.resolvedLanguage;

  const productLabel = (product) =>
    `${product.reference} — ${lng === 'en' && product.designationEn ? product.designationEn : product.designation}`;

  const update = (index, patch) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const addLine = () => onChange([...lines, { productId: '', quantity: 1, unitPrice: 0 }]);
  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const available = availability?.get(line.productId);
        const insufficient =
          availability && line.productId && (available ?? 0) < Number(line.quantity || 0);

        return (
          <div
            key={index}
            className={`rounded-lg border p-3 ${insufficient ? 'border-sgs-danger bg-red-50/50' : 'border-slate-200'}`}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <label htmlFor={`line-product-${index}`} className="label text-xs">
                  {t('common:fields.designation')}
                </label>
                <select
                  id={`line-product-${index}`}
                  value={line.productId}
                  onChange={(e) => update(index, { productId: e.target.value })}
                  className="input"
                >
                  <option value="">—</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {productLabel(product)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-28">
                <label htmlFor={`line-qty-${index}`} className="label text-xs">
                  {t('common:fields.quantity')}
                </label>
                <input
                  id={`line-qty-${index}`}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => update(index, { quantity: e.target.value })}
                  className="input"
                />
              </div>

              {withPrice && (
                <div className="w-32">
                  <label htmlFor={`line-price-${index}`} className="label text-xs">
                    {t('stock:receipt.unitPrice')}
                  </label>
                  <input
                    id={`line-price-${index}`}
                    type="number"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => update(index, { unitPrice: e.target.value })}
                    className="input"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => removeLine(index)}
                aria-label={t('common:actions.delete')}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-sgs-danger"
              >
                <FiTrash2 className="size-4" />
              </button>
            </div>

            {availability && line.productId && (
              <p
                className={`mt-2 flex items-center gap-1.5 text-xs ${
                  insufficient ? 'font-medium text-sgs-danger' : 'text-slate-500'
                }`}
              >
                {insufficient && <FiAlertTriangle className="size-3.5" />}
                {t('stock:issue.availableInWarehouse', {
                  quantity: formatQuantity(available ?? 0, lng),
                })}
              </p>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addLine} className="btn-secondary w-full">
        <FiPlus className="size-4" />
        {t('stock:document.addLine')}
      </button>
    </div>
  );
}
