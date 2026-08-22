import { useTranslation } from 'react-i18next';

/**
 * The invoice as it appears on paper.
 *
 * A dedicated print stylesheet rather than a screenshot of the modal: printing
 * the app's chrome — sidebar, buttons, badges — wastes the page and looks
 * unprofessional handed to a customer. `print:` utilities hide everything else
 * and let this block take the sheet.
 */
export default function InvoiceView({ invoice }) {
  const { t } = useTranslation(['stock', 'common']);

  return (
    <div id="sgs-invoice" className="bg-white p-6 text-slate-900 print:p-0">
      <header className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
        <div>
          <p className="text-2xl font-bold text-sgs-primary">SIPROCOM</p>
          <p className="text-xs text-slate-500">{t('common:app.subtitle')}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-sgs-primary">{t('stock:invoice.title')}</p>
          <p className="font-mono text-sm">{invoice.number}</p>
          <p className="text-sm text-slate-500">{invoice.date}</p>
        </div>
      </header>

      <div className="mb-4 text-sm">
        <p>
          <span className="text-slate-500">{t('stock:issue.recipient')} : </span>
          <span className="font-medium">{invoice.recipient}</span>
        </p>
        {invoice.recipientPhone && (
          <p>
            <span className="text-slate-500">{t('stock:invoice.phone')} : </span>
            {invoice.recipientPhone}
          </p>
        )}
        {invoice.recipientAddress && (
          <p>
            <span className="text-slate-500">{t('stock:invoice.address')} : </span>
            {invoice.recipientAddress}
          </p>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sgs-primary text-white print:bg-slate-200 print:text-slate-900">
            <th className="border border-slate-300 px-3 py-2 text-left">{t('common:fields.reference')}</th>
            <th className="border border-slate-300 px-3 py-2 text-left">{t('stock:invoice.designation')}</th>
            <th className="border border-slate-300 px-3 py-2 text-right">{t('stock:invoice.quantity')}</th>
            <th className="border border-slate-300 px-3 py-2 text-right">{t('stock:invoice.unitPrice')}</th>
            <th className="border border-slate-300 px-3 py-2 text-right">{t('stock:invoice.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.rows.map((row, index) => (
            <tr key={index}>
              <td className="border border-slate-300 px-3 py-2 font-mono text-xs">{row.reference}</td>
              <td className="border border-slate-300 px-3 py-2">{row.designation}</td>
              <td className="border border-slate-300 px-3 py-2 text-right whitespace-nowrap">{row.quantity}</td>
              <td className="border border-slate-300 px-3 py-2 text-right whitespace-nowrap">{row.unitPriceLabel}</td>
              <td className="border border-slate-300 px-3 py-2 text-right whitespace-nowrap">{row.totalLabel}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-bold">
            <td className="border border-slate-300 px-3 py-2" colSpan={3} />
            <td className="border border-slate-300 px-3 py-2 text-right">{t('stock:invoice.grandTotal')}</td>
            <td className="border border-slate-300 px-3 py-2 text-right whitespace-nowrap">
              {invoice.grandTotalLabel}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-12 flex justify-between text-xs text-slate-500">
        <p>{t('stock:invoice.issuedBy')} ...........................</p>
        <p>{t('stock:invoice.receivedBy')} ...........................</p>
      </div>
    </div>
  );
}
