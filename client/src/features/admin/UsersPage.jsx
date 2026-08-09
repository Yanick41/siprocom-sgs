import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FiPlus, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { usersApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import FormField from '@/components/FormField';
import StatusBadge from '@/components/StatusBadge';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import { formatDateTime } from '@/lib/format';

const ROLES = ['ADMIN', 'MAGASINIER', 'ACHATS', 'DIRECTION'];

export default function UsersPage() {
  const { t, i18n } = useTranslation(['admin', 'common', 'auth']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { user: currentUser } = useAuth();

  const [filters, setFilters] = useState({ search: '', page: 1 });
  const [editing, setEditing] = useState(null);

  const query = useQuery({
    queryKey: ['users', filters],
    queryFn: () => usersApi.list({ ...filters, limit: 25 }),
    placeholderData: (previous) => previous,
  });

  const columns = [
    {
      key: 'name',
      header: t('admin:users.name'),
      render: (u) => (
        <span className="font-medium text-slate-900">
          {u.name}
          {u.id === currentUser?.id && (
            <span className="ml-2 text-xs font-normal text-slate-400">{t('admin:users.you')}</span>
          )}
        </span>
      ),
    },
    { key: 'email', header: t('admin:users.email') },
    { key: 'role', header: t('admin:users.role'), render: (u) => t(`auth:roles.${u.role}`) },
    {
      key: 'lastLoginAt',
      header: t('admin:users.lastLogin'),
      render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt, lng) : '—'),
    },
    {
      key: 'isActive',
      header: t('common:fields.status'),
      render: (u) => (
        <StatusBadge tone={u.isActive ? 'success' : 'neutral'}>
          {u.isActive ? t('admin:users.active') : t('admin:users.inactive')}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('admin:users.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin:users.subtitle')}</p>
        </div>
        <button type="button" onClick={() => setEditing({})} className="btn-primary">
          <FiPlus className="size-4" />
          {t('admin:users.new')}
        </button>
      </div>

      <div className="card p-4">
        <div className="relative max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
            placeholder={t('admin:users.searchPlaceholder')}
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
        onRowClick={(u) => setEditing(u)}
      />

      {editing && (
        <UserFormModal
          user={editing.id ? editing : null}
          isSelf={editing.id === currentUser?.id}
          onClose={() => setEditing(null)}
          onSaved={(wasCreate) => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['users'] });
            toast.success(wasCreate ? t('admin:users.toast.created') : t('admin:users.toast.updated'));
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, isSelf, onClose, onSaved }) {
  const { t } = useTranslation(['admin', 'common', 'auth']);
  const translateError = useErrorMessage();
  const isEdit = Boolean(user);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? 'MAGASINIER',
      locale: user?.locale ?? 'fr',
      isActive: user?.isActive ?? true,
      password: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values) => (isEdit ? usersApi.update({ id: user.id, ...values }) : usersApi.create(values)),
    onSuccess: () => onSaved(!isEdit),
    onError: setSubmitError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? t('admin:users.editTitle') : t('admin:users.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="user-form" disabled={mutation.isPending} className="btn-primary">
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
        id="user-form"
        onSubmit={handleSubmit((values) => {
          setSubmitError(null);
          const payload = { ...values };
          // An empty password field on edit means "leave it unchanged", not "set it to empty".
          if (isEdit && !payload.password) delete payload.password;
          mutation.mutate(payload);
        })}
        className="space-y-4"
        noValidate
      >
        <FormField label={t('admin:users.name')} name="name" error={errors.name} required>
          {(props) => <input {...props} type="text" {...register('name', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <FormField label={t('admin:users.email')} name="email" error={errors.email} required>
          {(props) => <input {...props} type="email" {...register('email', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <FormField
          label={isEdit ? t('admin:users.newPassword') : t('admin:users.password')}
          name="password"
          error={errors.password}
          required={!isEdit}
          hint={isEdit ? t('admin:users.passwordHint') : t('admin:users.passwordMin')}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              {...register('password', isEdit ? {} : { required: 'VALIDATION_FAILED', minLength: { value: 8, message: 'PASSWORD_TOO_SHORT' } })}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin:users.role')} name="role" error={errors.role} required>
            {(props) => (
              <select {...props} disabled={isSelf} className={`${props.className} disabled:bg-slate-50`} {...register('role')}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{t(`auth:roles.${role}`)}</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label={t('admin:users.locale')} name="locale" error={errors.locale}>
            {(props) => (
              <select {...props} {...register('locale')}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            )}
          </FormField>
        </div>

        {/* The API refuses self-deactivation and removing the last admin; disabling
            the control here just avoids offering an action that will be rejected. */}
        {isEdit && (
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={isSelf} className="size-4 rounded" {...register('isActive')} />
            {t('admin:users.isActive')}
            {isSelf && <span className="text-xs text-slate-400">({t('admin:users.cannotDisableSelf')})</span>}
          </label>
        )}
      </form>
    </Modal>
  );
}
