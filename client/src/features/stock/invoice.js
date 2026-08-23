import { formatCurrency, formatDate, pdfText } from '@/lib/format';
import { unitLabel } from '@/lib/containers';

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

  // "2 cartons" when sold by the carton; otherwise whatever word the product
  // carries, or none at all.
  const lineUnit = (line) =>
    line.packaging === 'CARTON'
      ? t('common:units.carton', { count: line.quantity })
      : unitLabel(line.product, t, line.quantity);

  const rows = issue.lines.map((line) => {
    const unitPrice = Number(line.unitPrice) || 0;
    const total = unitPrice * line.quantity;

    return {
      designation: designation(line),
      reference: line.product.reference,
      // Quantity as sold, with its packaging — "2 cartons", not "24 bottles".
      // The base quantity is what left the shelf and belongs on the stock
      // journal, not on a customer's invoice.
      quantity: `${line.quantity} ${lineUnit(line)}`.trim(),
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
    recipientPhone: issue.recipientPhone || '',
    recipientAddress: issue.recipientAddress || '',
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
  doc.setTextColor(63, 98, 18); // sgs-primary
  doc.setFont(undefined, 'bold');
  doc.text('SIPROCOM', 14, 20);

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100);
  doc.text(pdfText(t('common:app.subtitle')), 14, 26);

  doc.setFontSize(14);
  doc.setTextColor(63, 98, 18); // sgs-primary
  doc.text(pdfText(t('stock:invoice.title')), pageWidth - 14, 20, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(pdfText(invoice.number), pageWidth - 14, 27, { align: 'right' });
  doc.text(pdfText(invoice.date), pageWidth - 14, 33, { align: 'right' });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 38, pageWidth - 14, 38);

  // Phone and address only take a line each when they were filled in, so a
  // walk-in sale does not print two empty labels.
  doc.setFontSize(9);
  let y = 46;

  doc.setTextColor(100);
  doc.text(pdfText(`${t('stock:issue.recipient')} :`), 14, y);
  doc.setTextColor(30);
  doc.setFont(undefined, 'bold');
  doc.text(pdfText(invoice.recipient), 45, y);
  doc.setFont(undefined, 'normal');

  if (invoice.recipientPhone) {
    y += 5;
    doc.setTextColor(100);
    doc.text(pdfText(`${t('stock:invoice.phone')} :`), 14, y);
    doc.setTextColor(30);
    doc.text(pdfText(invoice.recipientPhone), 45, y);
  }

  if (invoice.recipientAddress) {
    y += 5;
    doc.setTextColor(100);
    doc.text(pdfText(`${t('stock:invoice.address')} :`), 14, y);
    doc.setTextColor(30);
    doc.text(pdfText(invoice.recipientAddress), 45, y);
  }

  autoTable(doc, {
    startY: y + 8,
    head: [[
      t('common:fields.reference'),
      t('stock:invoice.designation'),
      t('stock:invoice.quantity'),
      t('stock:invoice.unitPrice'),
      t('stock:invoice.lineTotal'),
    ].map(pdfText)],
    body: invoice.rows.map((row) =>
      [row.reference, row.designation, row.quantity, row.unitPriceLabel, row.totalLabel].map(pdfText)
    ),
    // The grand total rides in the table's foot so it stays attached to the
    // last row even when the lines spill onto a second page.
    foot: [['', '', '', t('stock:invoice.grandTotal'), invoice.grandTotalLabel].map(pdfText)],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [63, 98, 18], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 254, 231], textColor: [63, 98, 18], fontStyle: 'bold', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 26 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });

  const endY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(pdfText(`${t('stock:invoice.issuedBy')} ..............................`), 14, endY);
  doc.text(pdfText(`${t('stock:invoice.receivedBy')} ..............................`), pageWidth - 14, endY, {
    align: 'right',
  });

  doc.save(`${invoice.number}.pdf`);
}
