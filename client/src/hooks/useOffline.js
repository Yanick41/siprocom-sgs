import { useEffect, useState } from 'react';

import { counts, subscribe } from '@/lib/offline/queue';
import { onSyncChange, flush } from '@/lib/offline/sync';

/**
 * Connection state and queue depth, for the header indicator.
 *
 * navigator.onLine is the browser's opinion about having a network interface,
 * not about being able to reach this server. It is right often enough to drive
 * a banner and wrong often enough that nothing here depends on it for
 * correctness: the queue drains by trying, not by believing.
 */
export function useOffline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [queue, setQueue] = useState({ pending: 0, conflicts: 0 });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;

    const refresh = () => {
      counts()
        .then((next) => {
          if (alive) setQueue(next);
        })
        .catch(() => {
          // IndexedDB unavailable (private mode, storage disabled). The app
          // still works online; the badge just stays at zero.
        });
    };

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribeQueue = subscribe(refresh);
    const unsubscribeSync = onSyncChange((state) => {
      setSyncing(Boolean(state.running));
      refresh();
    });

    refresh();

    return () => {
      alive = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribeQueue();
      unsubscribeSync();
    };
  }, []);

  return { online, syncing, ...queue, flush };
}
