import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2, FiPlus, FiAlertTriangle } from 'react-icons/fi';

import { formatQuantity, formatCurrency } from '@/lib/format';

/**
 * Editable product lines shared by receipts and issues.
 *
 * Typing beats picking. A shop with hundreds of references cannot scroll a
 * dropdown at the till, so the product field is a text input backed by a
 * datalist: type "whis", get the matches, keep going. The browser's own
 * autocomplete does the work, which also means it behaves correctly on a
 * tablet keyboard.
 *
 * Enter moves to the next field, and from the last field of a line to the next
 * line — creating one if needed. That is what makes a ten-line sale a matter of
 * typing rather than reaching for the mouse between every value.
 *
 * When `availability` is supplied (issues), each line is checked live against
 * the warehouse level: a magasinier should see the problem while entering the
 * document, not discover it when validation is refused.
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
  const containerRef = useRef(null);

  const productById = new Map(products.map((p) => [p.id, p]));

  /** "BOI-010 — Eau minérale 1.5L" — reference first, since that is what a
   *  shelf label carries and what an operator is most likely to type. */
  const optionLabel = (product) => `${product.reference} — ${product.designation}`;

  const findByLabel = (label) =>
    products.find((p) => optionLabel(p) === label) ??
    products.find((p) => p.reference.toLowerCase() === label.trim().toLowerCase());

  const update = (index, patch) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  /**
   * Selecting a product that is not sold by the carton must reset the line's
   * packaging, otherwise a leftover CARTON reaches the server and is rejected
   * there instead of here.
   */
  const selectProduct = (index, label) => {
    const product = findByLabel(label);
    if (!product) return update(index, { productId: '', productLabel: label });

    const keepsCarton = product.unitsPerCarton >= 2;
    const packaging = keepsCarton ? (line0(index)?.packaging ?? 'UNIT') : 'UNIT';

    update(index, {
      productId: product.id,
      productLabel: optionLabel(product),
      packaging,
      // Pre-filled from the price list, then editable: a shop quotes a regular
      // differently from a walk-in, and what is billed must be what prints.
      unitPrice: priceFor(product, packaging),
    });
  };

  const line0 = (index) => lines[index];

  const priceFor = (product, packaging) =>
    packaging === 'CARTON' ? Number(product.cartonSellPrice ?? 0) : Number(product.sellPrice ?? 0);

  const addLine = () =>
    onChange([...lines, { productId: '', productLabel: '', quantity: 1, unitPrice: 0, packaging: 'UNIT' }]);

  const removeLine = (index) => onChange(lines.filter((_, i) => i !== index));

  /**
   * Enter advances instead of submitting the form. The last field of the last
   * line adds a new one, so a long sale never needs the mouse.
   */
  const handleKeyDown = (event, index, isLastFieldOfLine) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isLastFieldOfLine && index === lines.length - 1) {
      addLine();
      // The row does not exist yet; focus it once React has committed.
      requestAnimationFrame(() => {
        const inputs = [...(containerRef.current?.querySelectorAll('input, select') ?? [])];
        inputs.find((el) => el.dataset.line === String(index + 1))?.focus();
      });
      return;
    }

    const focusable = [...(containerRef.current?.querySelectorAll('input, select') ?? [])];
    const current = focusable.indexOf(event.target);
    focusable[current + 1]?.focus();
  };

  // Uses the line's own price, not the product's — an agreed rate must be what
  // the operator sees totalled before saving.
  const grandTotal = lines.reduce(
    (sum, line) => (line.productId ? sum + Number(line.unitPrice || 0) * Number(line.quantity || 0) : sum),
    0
  );

  return (
    <div className="space-y-2" ref={containerRef}>
      <datalist id="sgs-products">
        {products.map((product) => (
          <option key={product.id} value={optionLabel(product)} />
        ))}
      </datalist>

      {lines.map((line, index) => {
        const product = productById.get(line.productId);
        const factor = product?.unitsPerCarton ?? 0;
        const sellsByCarton = factor >= 2;
        const packaging = line.packaging ?? 'UNIT';

        const baseQuantity = Number(line.quantity || 0) * (packaging === 'CARTON' ? factor : 1);
        const unitPrice = Number(line.unitPrice ?? 0);
        const lineTotal = unitPrice * Number(line.quantity || 0);

        const available = availability?.get(line.productId);
        const insufficient = availability && line.productId && (available ?? 0) < baseQuantity;

        // Text typed that matches nothing. Without this the line simply stays
        // invalid and the save button stays greyed out, with nothing on screen
        // explaining why — which is exactly how a typo becomes a lost minute.
        const unmatched = !line.productId && (line.productLabel ?? '').trim().length > 0;

        return (
          <div
            key={index}
            className={`rounded-lg border p-3 ${
              insufficient || unmatched ? 'border-sgs-danger bg-red-50/50' : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <label htmlFor={`line-product-${index}`} className="label text-xs">
                  {t('stock:document.productSearch')}
                </label>
                <input
                  id={`line-product-${index}`}
                  data-line={index}
                  list="sgs-products"
                  autoComplete="off"
                  value={line.productLabel ?? (product ? optionLabel(product) : '')}
                  onChange={(e) => selectProduct(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index, false)}
                  placeholder={t('stock:document.productSearchPlaceholder')}
                  className="input"
                />
              </div>

              <div className="w-24">
                <label htmlFor={`line-qty-${index}`} className="label text-xs">
                  {t('common:fields.quantity')}
                </label>
                <input
                  id={`line-qty-${index}`}
                  data-line={index}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => update(index, { quantity: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, index, !sellsByCarton && !withPrice)}
                  className="input"
                />
              </div>

              {sellsByCarton && (
                <div className="w-28">
                  <label htmlFor={`line-pack-${index}`} className="label text-xs">
                    {t('stock:document.packaging')}
                  </label>
                  <select
                    id={`line-pack-${index}`}
                    data-line={index}
                    value={packaging}
                    onChange={(e) =>
                      update(index, {
                        packaging: e.target.value,
                        unitPrice: priceFor(product, e.target.value),
                      })
                    }
                    onKeyDown={(e) => handleKeyDown(e, index, !withPrice)}
                    className="input"
                  >
                    <option value="UNIT">{t(`common:units.${product.unit}`, { defaultValue: product.unit })}</option>
                    <option value="CARTON">{t('common:units.carton')}</option>
                  </select>
                </div>
              )}

              {/* Editable on issues too: a shop quotes a regular differently
                  from a walk-in, and the figure billed is the one that must
                  reach the invoice — not the price list. */}
              <div className="w-28">
                  <label htmlFor={`line-price-${index}`} className="label text-xs">
                    {t('stock:invoice.unitPrice')}
                  </label>
                  <input
                    id={`line-price-${index}`}
                    data-line={index}
                    type="number"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => update(index, { unitPrice: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, index, true)}
                  className="input"
                />
              </div>

              <button
                type="button"
                onClick={() => removeLine(index)}
                aria-label={t('common:actions.delete')}
                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-sgs-danger"
              >
                <FiTrash2 className="size-4" />
              </button>
            </div>

            {unmatched && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-sgs-danger">
                <FiAlertTriangle className="size-3.5" />
                {products.length === 0
                  ? t('stock:document.noProductsYet')
                  : t('stock:document.productNotFound', { term: line.productLabel })}
              </p>
            )}

            {line.productId && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-mono text-slate-400">{product.reference}</span>

                {/* Shown as it is typed, so the operator sees what leaves the
                    shelf rather than trusting the arithmetic. */}
                {packaging === 'CARTON' && baseQuantity > 0 && (
                  <span className="font-medium text-slate-600">
                    = {formatQuantity(baseQuantity, lng)}{' '}
                    {t(`common:units.${product.unit}`, { defaultValue: product.unit })}
                  </span>
                )}

                <span className="font-medium text-slate-800">
                  {t('stock:invoice.lineTotal')} : {formatCurrency(lineTotal, lng)}
                </span>

                {availability && (
                  <span className={insufficient ? 'font-medium text-sgs-danger' : 'text-slate-500'}>
                    {insufficient && <FiAlertTriangle className="mr-1 inline size-3.5" />}
                    {t('stock:issue.availableInWarehouse', {
                      quantity: formatQuantity(available ?? 0, lng),
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addLine} className="btn-secondary w-full">
        <FiPlus className="size-4" />
        {t('stock:document.addLine')}
      </button>

      {!withPrice && grandTotal > 0 && (
        <p className="pt-1 text-right text-sm font-semibold text-slate-900">
          {t('stock:invoice.grandTotal')} : {formatCurrency(grandTotal, lng)}
        </p>
      )}
    </div>
  );
}
