import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiCloudOff, FiUploadCloud, FiAlertTriangle } from 'react-icons/fi';

import { useOffline } from '@/hooks/useOffline';

/**
 * Connection and queue state, in the header.
 *
 * Silent when there is nothing to say: online, nothing queued, no conflicts.
 * A permanent "connected" badge trains people to stop looking at it, and the
 * one moment this has to be noticed is the moment it changes.
 *
 * Three things it can report, in order of urgency:
 *   conflicts  the server refused something. Needs a person.
 *   offline    writes are being kept locally.
 *   pending    online, still draining.
 */
export default function OfflineIndicator() {
  const { t } = useTranslation(['common']);
  const { online, syncing, pending, conflicts, flush } = useOffline();

  if (online && pending === 0 && conflicts === 0) return null;

  if (conflicts > 0) {
    return (
      <Link
        to="/sync"
        className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        title={t('common:offline.conflictsHint')}
      >
        <FiAlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{t('common:offline.conflicts', { count: conflicts })}</span>
      </Link>
    );
  }

  if (!online) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700"
        title={t('common:offline.offlineHint')}
      >
        <FiCloudOff className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">
          {pending > 0 ? t('common:offline.offlineWithPending', { count: pending }) : t('common:offline.offline')}
        </span>
      </span>
    );
  }

  // Online with a queue: draining, or waiting for the next attempt. The button
  // exists because `online` can be true with no route to the server, and a
  // person watching a stuck counter needs something to press.
  return (
    <button
      type="button"
      onClick={() => flush()}
      disabled={syncing}
      title={t('common:offline.pendingHint')}
      className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
    >
      <FiUploadCloud className={`size-4 shrink-0 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
      <span className="hidden sm:inline">{t('common:offline.pending', { count: pending })}</span>
    </button>
  );
}
