import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FiPlus, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { suppliersApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { PermissionGate } from '@/components/ProtectedRoute';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import FormField from '@/components/FormField';
import { useErrorMessage } from '@/hooks/useErrorMessage';

export default function SuppliersPage() {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can } = useAuth();

  const [filters, setFilters] = useState({ search: '', page: 1 });
  const [editing, setEditing] = useState(null);

  const query = useQuery({
    queryKey: ['suppliers', filters],
    queryFn: () => suppliersApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const columns = [
    { key: 'name', header: t('admin:suppliers.name'), render: (s) => <span className="font-medium text-slate-900">{s.name}</span> },
    { key: 'contact', header: t('admin:suppliers.contact'), render: (s) => s.contact || '—' },
    { key: 'phone', header: t('admin:suppliers.phone'), render: (s) => s.phone || '—' },
    { key: 'email', header: t('admin:suppliers.email'), render: (s) => s.email || '—' },
    {
      key: 'products',
      header: t('admin:suppliers.productCount'),
      align: 'right',
      render: (s) => s._count?.products ?? 0,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('admin:suppliers.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin:suppliers.subtitle')}</p>
        </div>
        <PermissionGate permission="suppliers.write">
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <FiPlus className="size-4" />
            {t('admin:suppliers.new')}
          </button>
        </PermissionGate>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
            placeholder={t('admin:suppliers.searchPlaceholder')}
            aria-label={t('common:actions.search')}
            className="input pl-9"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items || []}
        pagination={query.data?.pagination}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error && translateError(query.error)}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        onRowClick={can('suppliers.write') ? (s) => setEditing(s) : undefined}
      />

      {editing && (
        <SupplierFormModal
          supplier={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(wasCreate) => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            toast.success(wasCreate ? t('admin:suppliers.toast.created') : t('admin:suppliers.toast.updated'));
          }}
        />
      )}
    </div>
  );
}

function SupplierFormModal({ supplier, onClose, onSaved }) {
  const { t } = useTranslation(['admin', 'common']);
  const translateError = useErrorMessage();
  const isEdit = Boolean(supplier);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: supplier?.name ?? '',
      contact: supplier?.contact ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values) =>
      isEdit ? suppliersApi.update({ id: supplier.id, ...values }) : suppliersApi.create(values),
    onSuccess: () => onSaved(!isEdit),
    onError: setSubmitError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? t('admin:suppliers.editTitle') : t('admin:suppliers.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="supplier-form" disabled={mutation.isPending} className="btn-primary">
            {t('common:actions.save')}
          </button>
        </>
      }
    >
      {submitError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {translateError(submitError)}
        </div>
      )}

      <form
        id="supplier-form"
        onSubmit={handleSubmit((values) => {
          setSubmitError(null);
          mutation.mutate(values);
        })}
        className="space-y-4"
        noValidate
      >
        <FormField label={t('admin:suppliers.name')} name="name" error={errors.name} required>
          {(props) => <input {...props} type="text" {...register('name', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin:suppliers.contact')} name="contact" error={errors.contact}>
            {(props) => <input {...props} type="text" {...register('contact')} />}
          </FormField>
          <FormField label={t('admin:suppliers.phone')} name="phone" error={errors.phone}>
            {(props) => <input {...props} type="tel" {...register('phone')} />}
          </FormField>
        </div>

        <FormField label={t('admin:suppliers.email')} name="email" error={errors.email}>
          {(props) => <input {...props} type="email" {...register('email')} />}
        </FormField>

        <FormField label={t('admin:suppliers.address')} name="address" error={errors.address}>
          {(props) => <textarea {...props} rows={2} className={`${props.className} py-2`} {...register('address')} />}
        </FormField>
      </form>
    </Modal>
  );
}
