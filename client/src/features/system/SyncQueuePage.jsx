import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiUploadCloud, FiTrash2, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { listPending, listConflicts, remove, subscribe } from '@/lib/offline/queue';
import { flush } from '@/lib/offline/sync';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { useOffline } from '@/hooks/useOffline';
import { formatDateTime } from '@/lib/format';
import StatusBadge from '@/components/StatusBadge';

/**
 * The offline queue, made visible.
 *
 * Two lists that mean different things. Pending entries will be sent and need
 * nothing from anyone. Refused entries never will: the server answered on the
 * merits, and replaying would produce the same answer forever.
 *
 * A refused entry can only be discarded here, never repaired. Editing a queued
 * sortie and resending it would produce a document the person who wrote it
 * never saw; the honest move is to drop it and enter it again against real,
 * current stock.
 */
export default function SyncQueuePage() {
  const { t, i18n } = useTranslation(['common']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();
  const { online, syncing } = useOffline();

  const [pending, setPending] = useState([]);
  const [conflicts, setConflicts] = useState([]);

  const refresh = useCallback(() => {
    Promise.all([listPending(), listConflicts()])
      .then(([p, c]) => {
        setPending(p);
        setConflicts(c);
      })
      .catch(() => {
        // No IndexedDB (private window, storage blocked). Nothing was queued
        // either, so two empty lists is the truthful view.
      });
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const discard = async (entry) => {
    if (!window.confirm(t('common:sync.confirmDiscard', { label: entry.label }))) return;
    await remove(entry.id);
    toast.success(t('common:sync.discarded'));
  };

  const row = (entry, refused) => (
    <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{entry.label}</p>
        <p className="text-xs text-slate-500">
          {formatDateTime(entry.createdAt, lng)}
          {entry.attempts > 0 && ` - ${t('common:sync.attempts', { count: entry.attempts })}`}
        </p>
        {refused && entry.lastError && (
          <p className="mt-1 text-xs text-sgs-danger">{translateError({ code: entry.lastError })}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!refused && <StatusBadge tone="neutral">{t('common:sync.waiting')}</StatusBadge>}
        <button
          type="button"
          onClick={() => discard(entry)}
          aria-label={t('common:sync.discard')}
          title={t('common:sync.discard')}
          className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-sgs-danger"
        >
          <FiTrash2 className="size-4" />
        </button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('common:sync.title')}</h1>
          <p className="text-sm text-slate-500">{t('common:sync.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => flush().then(refresh)}
          disabled={!online || syncing || pending.length === 0}
          className="btn-primary"
        >
          {syncing ? <FiRefreshCw className="size-4 animate-spin" /> : <FiUploadCloud className="size-4" />}
          {t('common:sync.sendNow')}
        </button>
      </div>

      {conflicts.length > 0 && (
        <section className="card overflow-hidden border-red-200">
          <header className="border-b border-red-200 bg-red-50 px-4 py-3">
            <h2 className="font-semibold text-red-800">
              {t('common:sync.refusedTitle', { count: conflicts.length })}
            </h2>
            <p className="mt-1 text-xs text-red-700">{t('common:sync.refusedHelp')}</p>
          </header>
          <ul className="divide-y divide-slate-100">{conflicts.map((e) => row(e, true))}</ul>
        </section>
      )}

      <section className="card overflow-hidden">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            {t('common:sync.pendingTitle', { count: pending.length })}
          </h2>
        </header>
        {pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t('common:sync.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">{pending.map((e) => row(e, false))}</ul>
        )}
      </section>
    </div>
  );
}
