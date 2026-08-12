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
export const CONTAINERS = ['glass_bottle', 'plastic_bottle', 'can', 'carton_pack'];
