/**
 * Physical containers a product can come in.
 *
 * Independent of the category: a Boisson énergétique exists as a can and as a
 * carton of cans, a water as glass or plastic. Nothing here constrains the
 * category, and the category constrains nothing here.
 *
 * Independent of  too. That one is what stock is counted in; this one
 * only describes the packaging, which is why Carton can appear in both
 * without conflict — a carton bought is still counted in bottles.
 */
export const CONTAINERS = ['glass_bottle', 'plastic_bottle', 'can', 'carton_pack', 'pouch'];

/**
 * The word to put after a quantity, or nothing.
 *
 * The product form no longer asks for a counting unit — it duplicated the
 * format field in the eyes of anyone filling it in. Products created since
 * carry the default, and writing "412 unité" everywhere would be noise, so
 * the word is shown only when it says something. Older products keep theirs.
 */
export const unitLabel = (product, t) =>
  product?.unit && product.unit !== 'unit'
    ? t(`common:units.${product.unit}`, { defaultValue: product.unit })
    : '';
