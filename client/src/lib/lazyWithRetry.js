import { lazy } from 'react';

/**
 * `React.lazy` that survives a chunk becoming unreachable.
 *
 * "Failed to fetch dynamically imported module" is not a code bug — the module
 * URL the open page holds simply no longer exists. It happens routinely:
 *
 *   dev   Vite re-optimises dependencies and rewrites the module graph while a
 *         tab is still open on the previous one.
 *   prod  a deploy replaces hashed chunks; anyone who loaded index.html before
 *         the deploy asks for a filename that is now gone. For a warehouse team
 *         that leaves tabs open all day, this is a matter of when, not if.
 *
 * Recovery, in order:
 *   1. Retry once — a transient network blip needs nothing more.
 *   2. Reload the page, which fetches the current index.html and its new chunk
 *      names.
 *
 * The reload is recorded in sessionStorage so a genuinely broken chunk shows
 * the error boundary instead of reloading forever. The flag clears on success,
 * so a later unrelated failure still gets its own retry.
 */
/**
 * The guard is keyed per chunk and expires, rather than being one flag for the
 * whole session. A single global flag meant that after any one recovery, every
 * later chunk failure — a different screen, minutes apart, a different cause —
 * went straight to the error boundary instead of recovering.
 */
const RELOAD_KEY = (name) => `sgs:chunk-reload:${name}`;
const RELOAD_WINDOW_MS = 15_000;

function reloadedRecently(name) {
  const at = Number(window.sessionStorage?.getItem(RELOAD_KEY(name)));
  return Boolean(at) && Date.now() - at < RELOAD_WINDOW_MS;
}

export default function lazyWithRetry(importer, name = 'screen') {
  return lazy(async () => {
    try {
      const module = await importer();
      window.sessionStorage?.removeItem(RELOAD_KEY(name));
      return module;
    } catch (error) {
      console.warn(`[SGS] Chunk load failed for ${name}, retrying…`, error);

      try {
        const module = await importer();
        window.sessionStorage?.removeItem(RELOAD_KEY(name));
        return module;
      } catch (retryError) {
        if (!reloadedRecently(name)) {
          window.sessionStorage?.setItem(RELOAD_KEY(name), String(Date.now()));
          window.location.reload();
          // Never settles — the reload replaces this document.
          return new Promise(() => {});
        }

        // A reload moments ago did not help: this chunk is genuinely missing.
        // Surface it rather than looping.
        console.error(`[SGS] Chunk still unreachable after reload: ${name}`);
        throw retryError;
      }
    }
  });
}
