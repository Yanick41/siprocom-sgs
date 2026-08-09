import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Excel and PDF export (§4.6, acceptance criterion 6: "sans perte de données").
 *
 * Both exporters take the same shape as DataTable columns, so a screen exports
 * exactly what it displays — headers included, in the active language.
 *
 * columns: [{ key, header, value?(row), align? }]
 *   `value` returns the RAW value (number stays a number). `render` is not used
 *   here on purpose: it returns JSX, and a spreadsheet needs real numbers to
 *   remain sortable and summable.
 */

const cellValue = (row, column) => {
  const value = column.value ? column.value(row) : row[column.key];
  return value === undefined || value === null ? '' : value;
};

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function exportToExcel({ columns, rows, filename, sheetName = 'Export' }) {
  const data = rows.map((row) => {
    const record = {};
    for (const column of columns) record[column.header] = cellValue(row, column);
    return record;
  });

  const sheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });

  // Width the columns to their content so nothing renders as "####".
  sheet['!cols'] = columns.map((column) => ({
    wch: Math.min(
      40,
      Math.max(column.header.length + 2, ...rows.map((r) => String(cellValue(r, column)).length + 2), 10)
    ),
  }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31)); // Excel caps sheet names at 31
  XLSX.writeFile(book, `${filename}-${stamp()}.xlsx`);
}

export function exportToPdf({
  columns,
  rows,
  filename,
  title,
  subtitle,
  locale = 'fr',
  orientation = 'landscape',
}) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.setTextColor(30, 58, 95); // SIPROCOM navy
  doc.text('SIPROCOM', 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(title, 14, 22);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 27);
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date()),
    pageWidth - 14,
    15,
    { align: 'right' }
  );

  autoTable(doc, {
    startY: subtitle ? 32 : 27,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((column) => String(cellValue(row, column)))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(
      columns.map((column, index) => [index, { halign: column.align === 'right' ? 'right' : 'left' }])
    ),
    didDrawPage: (data) => {
      const page = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`${page}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      // Keep the left margin stable across pages.
      data.settings.margin.left = 14;
    },
  });

  doc.save(`${filename}-${stamp()}.pdf`);
}
