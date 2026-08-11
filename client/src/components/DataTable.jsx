import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiInbox, FiAlertCircle } from 'react-icons/fi';

/**
 * Shared list table: loading / empty / error states, sorting and pagination.
 * Every list screen uses this so the three non-happy states are never forgotten.
 *
 * columns: [{ key, header, render?, sortable?, align?, className? }]
 */
export default function DataTable({
  columns,
  rows,
  isLoading,
  isError,
  error,
  pagination,
  onPageChange,
  sort,
  onSortChange,
  // The index is passed through so callers can fall back to it for aggregate
  // rows that carry no id — report rows grouped by category, for instance.
  getRowKey = (row) => row.id,
  onRowClick,
  emptyMessage,
}) {
  const { t } = useTranslation(['common', 'errors']);

  const handleSort = (key) => {
    if (!onSortChange) return;
    const nextOrder = sort?.sort === key && sort?.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ sort: key, order: nextOrder });
  };

  return (
    <div className="card overflow-hidden">
      {/* Wide tables scroll inside their own container so the page never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-left font-semibold text-slate-600 ${
                    col.align === 'right' ? 'text-right' : ''
                  } ${col.sortable ? 'cursor-pointer select-none hover:text-slate-900' : ''}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sort?.sort === col.key
                      ? sort.order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {col.header}
                  {sort?.sort === col.key && (
                    <span aria-hidden="true" className="ml-1 text-sgs-accent">
                      {sort.order === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                  {t('common:states.loading')}
                </td>
              </tr>
            )}

            {!isLoading && isError && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <FiAlertCircle className="mx-auto mb-2 size-6 text-sgs-danger" />
                  <p className="text-slate-700">{error || t('common:states.error')}</p>
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <FiInbox className="mx-auto mb-2 size-6 text-slate-300" />
                  <p className="text-slate-500">{emptyMessage || t('common:states.empty')}</p>
                </td>
              </tr>
            )}

            {!isLoading &&
              !isError &&
              rows.map((row, index) => (
                <tr
                  key={getRowKey(row, index)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-slate-700 ${
                        col.align === 'right' ? 'text-right' : ''
                      } ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-500">
            {t('common:pagination.showing', {
              from: (pagination.page - 1) * pagination.limit + 1,
              to: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              aria-label={t('common:actions.previous')}
            >
              <FiChevronLeft />
            </button>
            <span className="text-sm text-slate-600">
              {t('common:pagination.page', {
                page: pagination.page,
                totalPages: pagination.totalPages,
              })}
            </span>
            <button
              type="button"
              className="btn-secondary px-3"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              aria-label={t('common:actions.next')}
            >
              <FiChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
