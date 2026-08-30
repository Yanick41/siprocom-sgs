import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import api from '@/api/client';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDateTime } from '@/lib/format';

/**
 * Phase 0 verification screen: proves the full vertical slice works -
 * Vite build, Tailwind theme, i18n (FR/EN), React Query, axios, Express, Prisma, Postgres.
 * Replaced by the real dashboard in Phase 6.
 */
export default function SystemStatusPage() {
  const { t, i18n } = useTranslation(['common', 'errors']);
  const translateError = useErrorMessage();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health'),
    retry: false,
  });

  const dbOk = data?.db === true;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sgs-primary">
            {t('common:app.name')}
          </h1>
          <p className="text-sm text-slate-500">{t('common:app.subtitle')}</p>
        </div>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Phase 0 - Foundations
        </h2>

        {isLoading ? (
          <p className="text-slate-500">{t('common:states.loading')}</p>
        ) : (
          <dl className="space-y-3">
            <StatusRow label="API" ok={!isError} value={isError ? translateError(error) : 'OK'} />
            <StatusRow
              label="Database"
              ok={dbOk}
              value={dbOk ? 'PostgreSQL connected' : data?.hint || translateError(error)}
            />
            <StatusRow label="Environment" ok value={data?.env ?? '-'} neutral />
            <StatusRow
              label="Locale"
              ok
              neutral
              value={`${i18n.resolvedLanguage} · ${formatDateTime(
                data?.timestamp ?? Date.now(),
                i18n.resolvedLanguage
              )}`}
            />
          </dl>
        )}

        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary mt-6 w-full"
        >
          {isFetching ? t('common:states.loading') : t('common:actions.retry')}
        </button>
      </section>

      <p className="mt-6 text-center text-xs text-slate-400">
        {t('common:footer.version', { version: '0.1.0' })} - see IMPLEMENTATION_PLAN.md
      </p>
    </main>
  );
}

function StatusRow({ label, ok, value, neutral = false }) {
  const dotClass = neutral ? 'bg-slate-300' : ok ? 'bg-sgs-success' : 'bg-sgs-danger';
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-right text-sm text-slate-600">{value}</dd>
    </div>
  );
}
