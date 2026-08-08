import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { warehousesApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { PermissionGate } from '@/components/ProtectedRoute';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import FormField from '@/components/FormField';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';

export default function WarehousesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can } = useAuth();
  const [editing, setEditing] = useState(null);

  const query = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => warehousesApi.list({ includeInactive: '1' }),
  });

  const columns = [
    { key: 'code', header: t('admin:warehouses.code'), render: (w) => <span className="font-mono text-xs">{w.code}</span> },
    { key: 'name', header: t('admin:warehouses.name'), render: (w) => <span className="font-medium text-slate-900">{w.name}</span> },
    { key: 'address', header: t('admin:warehouses.address'), render: (w) => w.address || '—' },
    { key: 'managerName', header: t('admin:warehouses.manager'), render: (w) => w.managerName || '—' },
    {
      key: 'products',
      header: t('admin:warehouses.productCount'),
      align: 'right',
      render: (w) => w._count?.stockLevels ?? 0,
    },
    {
      key: 'isActive',
      header: t('common:fields.status'),
      render: (w) => (
        <StatusBadge tone={w.isActive ? 'success' : 'neutral'}>
          {w.isActive ? t('admin:warehouses.active') : t('admin:warehouses.inactive')}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('admin:warehouses.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin:warehouses.subtitle')}</p>
        </div>
        <PermissionGate permission="warehouses.write">
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <FiPlus className="size-4" />
            {t('admin:warehouses.new')}
          </button>
        </PermissionGate>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items || []}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error && translateError(query.error)}
        onRowClick={can('warehouses.write') ? (w) => setEditing(w) : undefined}
      />

      {editing && (
        <WarehouseFormModal
          warehouse={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(wasCreate) => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['warehouses'] });
            toast.success(wasCreate ? t('admin:warehouses.toast.created') : t('admin:warehouses.toast.updated'));
          }}
        />
      )}
    </div>
  );
}

function WarehouseFormModal({ warehouse, onClose, onSaved }) {
  const { t } = useTranslation(['admin', 'common']);
  const translateError = useErrorMessage();
  const isEdit = Boolean(warehouse);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      code: warehouse?.code ?? '',
      name: warehouse?.name ?? '',
      address: warehouse?.address ?? '',
      managerName: warehouse?.managerName ?? '',
      isActive: warehouse?.isActive ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (values) =>
      isEdit ? warehousesApi.update({ id: warehouse.id, ...values }) : warehousesApi.create(values),
    onSuccess: () => onSaved(!isEdit),
    onError: setSubmitError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? t('admin:warehouses.editTitle') : t('admin:warehouses.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="warehouse-form" disabled={mutation.isPending} className="btn-primary">
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
        id="warehouse-form"
        onSubmit={handleSubmit((values) => {
          setSubmitError(null);
          mutation.mutate({ ...values, code: values.code.toUpperCase() });
        })}
        className="space-y-4"
        noValidate
      >
        <FormField
          label={t('admin:warehouses.code')}
          name="code"
          error={errors.code}
          required
          hint={t('admin:warehouses.codeHint')}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              disabled={isEdit}
              className={`${props.className} font-mono uppercase disabled:bg-slate-50`}
              {...register('code', { required: 'VALIDATION_FAILED' })}
            />
          )}
        </FormField>

        <FormField label={t('admin:warehouses.name')} name="name" error={errors.name} required>
          {(props) => <input {...props} type="text" {...register('name', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <FormField label={t('admin:warehouses.address')} name="address" error={errors.address}>
          {(props) => <textarea {...props} rows={2} className={`${props.className} py-2`} {...register('address')} />}
        </FormField>

        <FormField label={t('admin:warehouses.manager')} name="managerName" error={errors.managerName}>
          {(props) => <input {...props} type="text" {...register('managerName')} />}
        </FormField>

        {isEdit && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 rounded" {...register('isActive')} />
            {t('admin:warehouses.isActive')}
          </label>
        )}
      </form>
    </Modal>
  );
}
