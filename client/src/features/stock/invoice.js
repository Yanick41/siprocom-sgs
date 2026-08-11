import { formatCurrency, formatDate } from '@/lib/format';

/**
 * Builds the printable form of a goods issue, once, for both outputs.
 *
 * The PDF and the on-screen print view read from the same object, so a column
 * added to one cannot quietly go missing from the other — the two would drift
 * apart within a release otherwise.
 *
 * Every figure comes from the stored line: `unitPrice` was frozen when the
 * document was created, so an invoice reprinted next year shows what was
 * billed, not today's price list.
 */
export function buildInvoice(issue, { t, lng = 'fr' }) {
  const designation = (line) =>
    lng === 'en' && line.product.designationEn ? line.product.designationEn : line.product.designation;

  const unitLabel = (line) =>
    line.packaging === 'CARTON'
      ? t('common:units.carton')
      : t(`common:units.${line.product.unit}`, { defaultValue: line.product.unit });

  const rows = issue.lines.map((line) => {
    const unitPrice = Number(line.unitPrice) || 0;
    const total = unitPrice * line.quantity;

    return {
      designation: designation(line),
      reference: line.product.reference,
      // Quantity as sold, with its packaging — "2 cartons", not "24 bottles".
      // The base quantity is what left the shelf and belongs on the stock
      // journal, not on a customer's invoice.
      quantity: `${line.quantity} ${unitLabel(line)}`,
      baseQuantity: line.baseQuantity,
      unitPrice,
      total,
      unitPriceLabel: formatCurrency(unitPrice, lng),
      totalLabel: formatCurrency(total, lng),
    };
  });

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return {
    number: issue.number,
    date: formatDate(issue.issueDate, lng),
    recipient: issue.recipient || '—',
    warehouse: issue.warehouse?.name ?? '',
    status: issue.status,
    rows,
    grandTotal,
    grandTotalLabel: formatCurrency(grandTotal, lng),
  };
}

/**
 * Renders the invoice as a PDF.
 *
 * Portrait, not the landscape used by the data exports: an invoice is filed and
 * handed over, and A4 portrait is what a customer expects to receive.
 */
// Only `t` is needed: every figure was already formatted into the invoice object.
export async function downloadInvoicePdf(invoice, { t }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(20);
  doc.setTextColor(30, 58, 95);
  doc.setFont(undefined, 'bold');
  doc.text('SIPROCOM', 14, 20);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100);
  doc.text(t('common:app.subtitle'), 14, 26);

  doc.setFontSize(14);
  doc.setTextColor(30, 58, 95);
  doc.text(t('stock:invoice.title'), pageWidth - 14, 20, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(invoice.number, pageWidth - 14, 27, { align: 'right' });
  doc.text(invoice.date, pageWidth - 14, 33, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 38, pageWidth - 14, 38);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${t('stock:issue.recipient')} :`, 14, 46);
  doc.setTextColor(30);
  doc.setFont(undefined, 'bold');
  doc.text(invoice.recipient, 40, 46);
  doc.setFont(undefined, 'normal');

  autoTable(doc, {
    startY: 54,
    head: [[
      t('stock:invoice.designation'),
      t('stock:invoice.quantity'),
      t('stock:invoice.unitPrice'),
      t('stock:invoice.lineTotal'),
    ]],
    body: invoice.rows.map((row) => [row.designation, row.quantity, row.unitPriceLabel, row.totalLabel]),
    // The grand total rides in the table's foot so it stays attached to the
    // last row even when the lines spill onto a second page.
    foot: [['', '', t('stock:invoice.grandTotal'), invoice.grandTotalLabel]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [30, 58, 95], fontStyle: 'bold', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'right', cellWidth: 32 },
      3: { halign: 'right', cellWidth: 34 },
    },
    margin: { left: 14, right: 14 },
  });

  const endY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${t('stock:invoice.issuedBy')} ..............................`, 14, endY);
  doc.text(`${t('stock:invoice.receivedBy')} ..............................`, pageWidth - 14, endY, {
    align: 'right',
  });

  doc.save(`${invoice.number}.pdf`);
}
