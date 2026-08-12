/**
 * Units, separated by what they actually are.
 *
 * The single flat list mixed three unrelated ideas — how stock is counted, how
 * goods are bought in bulk, and how loose product is weighed — so "carton"
 * appeared as a candidate base unit. That is not a labelling problem: a carton
 * is never the unit stock is counted in, because a carton opened is bottles.
 *
 * COUNTED    one physical item. Stock, thresholds and alerts are in this.
 * BULK       measured, not counted. Kept for future loose goods; irrelevant to
 *            a drinks shop, so it is offered in its own group rather than mixed
 *            in with the rest.
 * GROUPING   a quantity of base units. Never a base unit itself — it appears
 *            only in the carton section, always with a conversion factor.
 */
export const BASE_UNITS = {
  counted: ['bottle', 'can', 'piece', 'unit'],
  bulk: ['kg', 'litre'],
};

/** Selectable as a product's base unit. */
export const UNITS = [...BASE_UNITS.counted, ...BASE_UNITS.bulk];

/**
 * Grouping units. Each needs a factor towards the base unit, which is why they
 * live with `unitsPerCarton` rather than in the base-unit list.
 */
export const GROUPING_UNITS = ['carton', 'crate', 'pack'];

/**
 * Values stored before the split. Kept so an existing product renders a proper
 * label instead of a raw key; none of them can be chosen for a new one.
 */
export const LEGACY_UNIT_ALIASES = {
  box: 'carton',
  sac: 'bag',
  bag: 'unit',
  paquet: 'pack',
  carton: 'unit',
  crate: 'unit',
  pack: 'unit',
};

/**
 * Resolves a stored value to something selectable.
 *
 * A product saved with `carton` as its base unit predates the distinction —
 * mapping it to `unit` keeps the form usable, and the real base unit is a
 * decision only the operator can make.
 */
export const canonicalUnit = (unit) => {
  if (!unit) return 'unit';
  if (UNITS.includes(unit)) return unit;
  return LEGACY_UNIT_ALIASES[unit] ?? 'unit';
};
