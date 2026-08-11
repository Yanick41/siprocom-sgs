import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiPlus, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { productsApi, categoriesApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { PermissionGate } from '@/components/ProtectedRoute';
import DataTable from '@/components/DataTable';
import StatusBadge from '@/components/StatusBadge';
import { stockTone } from '@/lib/stockState';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatCurrency, formatQuantity } from '@/lib/format';
import ProductFormModal from './ProductFormModal';

export default function ProductsPage() {
  const { t, i18n } = useTranslation(['products', 'common']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    status: 'active',
    stockState: '',
    page: 1,
    sort: 'designation',
    order: 'asc',
  });
  const [editing, setEditing] = useState(null); // null = closed, {} = create

  const productsQuery = useQuery({
    queryKey: ['products', filters],
    queryFn: () => productsApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous, // avoids a flash of empty table while paging
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const columns = [
    { key: 'reference', header: t('common:fields.reference'), sortable: true },
    {
      key: 'designation',
      header: t('common:fields.designation'),
      sortable: true,
      render: (p) => (
        <div>
          {/* Business data, not UI text: fall back to French when no EN label exists. */}
          <p className="font-medium text-slate-900">
            {lng === 'en' && p.designationEn ? p.designationEn : p.designation}
          </p>
          {!p.isActive && (
            <StatusBadge tone="neutral">{t('products:status.inactive')}</StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: t('common:fields.category'),
      render: (p) => (lng === 'en' && p.category?.nameEn ? p.category.nameEn : p.category?.name),
    },
    {
      key: 'totalStock',
      header: t('products:columns.stock'),
      align: 'right',
      render: (p) => (
        <StatusBadge tone={stockTone(p.totalStock, p.minThreshold, p.maxThreshold)}>
          {formatQuantity(p.totalStock, lng)} {t(`common:units.${p.unit}`, { defaultValue: p.unit })}
        </StatusBadge>
      ),
    },
    {
      key: 'minThreshold',
      header: t('products:columns.threshold'),
      align: 'right',
      sortable: true,
      render: (p) => `${p.minThreshold}${p.maxThreshold ? ` / ${p.maxThreshold}` : ''}`,
    },
    {
      key: 'sellPrice',
      header: t('products:columns.sellPrice'),
      align: 'right',
      sortable: true,
      render: (p) => formatCurrency(p.sellPrice, lng),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('products:title')}</h1>
          <p className="text-sm text-slate-500">{t('products:subtitle')}</p>
        </div>
        <PermissionGate permission="products.write">
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <FiPlus className="size-4" />
            {t('products:actions.new')}
          </button>
        </PermissionGate>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <FiSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder={t('products:filters.searchPlaceholder')}
            aria-label={t('common:actions.search')}
            className="input pl-9"
          />
        </div>

        <select
          value={filters.categoryId}
          onChange={(e) => setFilter({ categoryId: e.target.value })}
          aria-label={t('common:fields.category')}
          className="input w-auto min-w-44"
        >
          <option value="">{t('products:filters.allCategories')}</option>
          {(categoriesQuery.data?.items || [])
            .filter((c) => c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {lng === 'en' && c.nameEn ? c.nameEn : c.name}
              </option>
            ))}
        </select>

        <select
          value={filters.stockState}
          onChange={(e) => setFilter({ stockState: e.target.value })}
          aria-label={t('products:filters.stockState')}
          className="input w-auto min-w-44"
        >
          <option value="">{t('products:filters.allStock')}</option>
          <option value="low">{t('products:filters.lowStock')}</option>
          <option value="out">{t('products:filters.outOfStock')}</option>
          <option value="over">{t('products:filters.overStock')}</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilter({ status: e.target.value })}
          aria-label={t('common:fields.status')}
          className="input w-auto min-w-36"
        >
          <option value="active">{t('products:status.active')}</option>
          <option value="inactive">{t('products:status.inactive')}</option>
          <option value="all">{t('products:filters.allStatuses')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={productsQuery.data?.items || []}
        pagination={productsQuery.data?.pagination}
        isLoading={productsQuery.isLoading}
        isError={productsQuery.isError}
        error={productsQuery.error && translateError(productsQuery.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        sort={{ sort: filters.sort, order: filters.order }}
        onSortChange={({ sort, order }) => setFilters((f) => ({ ...f, sort, order }))}
        onRowClick={can('products.write') ? (p) => setEditing(p) : undefined}
        emptyMessage={t('products:empty')}
      />

      {editing && (
        <ProductFormModal
          product={editing.id ? editing : null}
          categories={categoriesQuery.data?.items || []}
          onClose={() => setEditing(null)}
          onSaved={(wasCreate) => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['products'] });
            toast.success(wasCreate ? t('products:toast.created') : t('products:toast.updated'));
          }}
        />
      )}
    </div>
  );
}
