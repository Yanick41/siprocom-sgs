import { zipSync, strToU8 } from 'fflate';

/**
 * A minimal .xlsx writer.
 *
 * Replaces SheetJS, which cost 414 kB and carries two advisories with no fix
 * published - prototype pollution and a ReDoS - because the npm package is no
 * longer the maintained distribution. That is a lot of weight and a standing
 * risk for one feature: turning a table into a spreadsheet.
 *
 * An .xlsx is a zip of XML. This writes the five entries Excel actually
 * requires and nothing else, so the whole exporter is fflate (about 11 kB
 * gzipped) plus this file.
 *
 * Deliberately not a general-purpose library. It writes one sheet of strings,
 * numbers and dates, which is exactly what the export screens hand it. Formulas,
 * styling, merged cells and multiple sheets are absent because nothing here
 * needs them, and every one of them is a way to produce a file Excel refuses
 * to open.
 */

/**
 * XML text escaping.
 *
 * Also strips control characters. A product designation pasted from a supplier
 * PDF can carry a stray 0x0B, which is legal in a JS string and makes the whole
 * sheet unreadable: Excel rejects the file outright rather than skipping the
 * cell, so one bad character loses the entire export.
 */
const esc = (value) =>
  String(value)
    // oxlint-disable-next-line no-control-regex -- matching them is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A1, B1 ... Z1, AA1. Excel columns are base-26 with no zero. */
function cellRef(columnIndex, rowIndex) {
  let name = '';
  let n = columnIndex + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${rowIndex + 1}`;
}

/**
 * Excel keeps dates as days since 1900, with a deliberate off-by-one: it
 * believes 1900 was a leap year, for compatibility with Lotus 1-2-3. 25569 is
 * the epoch offset that falls out of that.
 */
const excelDate = (date) => date.getTime() / 86_400_000 + 25569;

function cellXml(value, columnIndex, rowIndex) {
  const ref = cellRef(columnIndex, rowIndex);

  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // s="1" points at the date format declared in styles.xml below.
    return `<c r="${ref}" s="1"><v>${excelDate(value)}</v></c>`;
  }

  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  // Inline strings rather than a shared-strings table: one fewer part to keep
  // consistent, and the exports here are far too small for the dictionary to
  // earn its complexity.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(rows, widths) {
  const cols = widths?.length
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const body = rows
    .map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => cellXml(value, columnIndex, rowIndex)).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Two cell formats: general, and a date. numFmtId 14 is Excel's built-in short
 * date, which renders in the reader's own locale rather than freezing a French
 * order into the file.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

const workbookXml = (sheetName) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

/**
 * Builds the workbook.
 *
 * @param {Array<Array<string|number|Date|boolean|null>>} rows header row first
 * @param {object}  options
 * @param {string}  options.sheetName
 * @param {number[]=} options.widths column widths, in Excel's character units
 * @returns {Blob}
 */
export function buildWorkbook(rows, { sheetName = 'Export', widths } = {}) {
  // Excel refuses the file outright if a sheet name is over 31 characters or
  // contains any of : \ / ? * [ ]
  const safeName = String(sheetName).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Export';

  const zipped = zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'xl/workbook.xml': strToU8(workbookXml(safeName)),
      'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
      'xl/styles.xml': strToU8(STYLES),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows, widths)),
    },
    // Level 6 rather than 9: these are small XML documents, and the difference
    // in bytes is not worth making a magasinier's tablet think about it.
    { level: 6 }
  );

  return new Blob([zipped], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
