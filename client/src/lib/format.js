/**
 * All user-visible dates, numbers and money go through these helpers.
 * Never hand-build "dd/mm/yyyy" or call toFixed() for display -
 * see IMPLEMENTATION_PLAN.md §7 rule 8.
 */

// Confirm with SIPROCOM (open question Q3 in the plan).
export const CURRENCY = 'XOF';
export const CURRENCY_DECIMALS = 0;

const localeTag = (lng) => (lng === 'en' ? 'en-GB' : 'fr-FR');

export const formatNumber = (value, lng, options = {}) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat(localeTag(lng), options).format(Number(value));
};

export const formatCurrency = (value, lng) =>
  formatNumber(value, lng, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: CURRENCY_DECIMALS,
    maximumFractionDigits: CURRENCY_DECIMALS,
  });

/**
 * Makes a formatted string safe for jsPDF's built-in fonts.
 *
 * French formatting separates thousands with a NARROW NO-BREAK SPACE
 * (U+202F) and puts a NO-BREAK SPACE (U+00A0) before the currency. The
 * standard PDF fonts are WinAnsi-encoded and have no glyph for either, so
 * jsPDF emitted stray slashes: "72 300 F CFA" printed as "7 2 / 3 0 0 F / C
 * F A", which is how an invoice reaches a customer looking broken.
 *
 * Applied at the PDF boundary rather than in the formatters, because on
 * screen those characters are exactly right - they are what stops a number
 * wrapping across a line.
 */
export const pdfText = (value) =>
  String(value ?? '').replace(/[   ]/g, ' ');

export const formatQuantity = (value, lng) =>
  formatNumber(value, lng, { maximumFractionDigits: 0 });

export const formatDate = (value, lng) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(localeTag(lng), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
};

export const formatDateTime = (value, lng) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(localeTag(lng), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export const formatPercent = (value, lng) =>
  formatNumber(value, lng, { style: 'percent', maximumFractionDigits: 1 });
