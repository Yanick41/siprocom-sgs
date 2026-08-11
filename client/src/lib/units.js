/**
 * The canonical list of measurement units.
 *
 * Single source of truth, because the previous inline list mixed English keys
 * with French ones: `box` translated to "carton" while `carton` had no French
 * translation and fell back to its own key — so the dropdown showed "carton"
 * twice. The same collision hit `pack` and `paquet`. In English the two words
 * differ, which is why it went unnoticed.
 *
 * Every key here is English and every key has both translations, so a missing
 * entry now shows up in `npm run i18n:check` rather than as a silent duplicate.
 */
export const UNITS = [
  'unit',
  'piece',
  'bottle',
  'carton',
  'crate',
  'pack',
  'bag',
  'kg',
  'litre',
];

/**
 * Legacy values still stored on products seeded before the list was unified.
 * Kept so an old row renders a proper label instead of a raw key; new products
 * can only pick from UNITS.
 */
export const LEGACY_UNIT_ALIASES = {
  box: 'carton',
  sac: 'bag',
  paquet: 'pack',
};

/** Resolves a stored value to a canonical key. */
export const canonicalUnit = (unit) => LEGACY_UNIT_ALIASES[unit] ?? unit;
