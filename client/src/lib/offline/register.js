/**
 * Service worker registration.
 *
 * Production only. In dev, Vite serves modules unbundled and a worker caching
 * them shows you yesterday's component after an edit, which is a genuinely
 * horrible way to lose an afternoon. `npm run build && npm run preview` is the
 * way to exercise offline mode locally.
 */

export function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // A failed registration costs offline mode, not the app. Nothing to say
      // to the user: everything still works while the network is up.
    });
  });
}

/**
 * Drops cached API responses. Called on sign-out, so the next person at this
 * machine cannot read the previous session's stock and purchase prices out of
 * the cache before the first live request comes back.
 */
export function clearApiCache() {
  navigator.serviceWorker?.controller?.postMessage('sgs:clear-api-cache');
}
