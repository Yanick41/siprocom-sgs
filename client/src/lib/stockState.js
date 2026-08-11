/**
 * Maps a stock level against its thresholds to a badge tone.
 *
 * Single source of truth so every screen colours stock identically — a product
 * shown amber on one page and red on another would erode trust in both.
 *
 * Lives outside the component file so `StatusBadge.jsx` exports only a
 * component and keeps working with fast refresh.
 */
export function stockTone(quantity, minThreshold, maxThreshold) {
  if (quantity <= 0) return 'danger';
  if (quantity < minThreshold) return 'warning';
  if (maxThreshold != null && quantity > maxThreshold) return 'info';
  return 'success';
}
