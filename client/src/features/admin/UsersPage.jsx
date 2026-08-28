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

  /**
   * The credential being handed over, or null.
   *
   * There is no email in this system, so the administrator reads the code out or
   * writes it down. It is stored only as a hash, so the dialog below is the only
   * place it will ever appear - closing it without noting the value means
   * issuing a new one, which is what the button on each row does.
   */
  const [handout, setHandout] = useState(null);

  const findUser = (id) => (query.data?.items ?? []).find((u) => u.id === id);

  const codeMutation = useMutation({
    mutationFn: usersApi.activationCode,
    onSuccess: (result, id) =>
      setHandout({ kind: 'code', value: result.activationCode, user: findUser(id) }),
    onError: (error) => toast.error(translateError(error)),
  });

  const resetMutation = useMutation({
    mutationFn: usersApi.passwordResetLink,
    onSuccess: (result, id) =>
      setHandout({ kind: 'link', value: result.resetUrl, user: findUser(id) }),
    onError: (error) => toast.error(translateError(error)),
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
      render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt, lng) : '-'),
    },
    {
      key: 'isActive',
      header: t('common:fields.status'),
      // An invited account that has not been activated is neither active nor
      // disabled - it is waiting on someone, and that is what the admin needs
      // to see before wondering why a colleague cannot log in.
      render: (u) =>
        u.pending ? (
          <StatusBadge tone="warning">{t('admin:users.pending')}</StatusBadge>
        ) : (
          <StatusBadge tone={u.isActive ? 'success' : 'neutral'}>
            {u.isActive ? t('admin:users.active') : t('admin:users.inactive')}
          </StatusBadge>
        ),
    },
    {
      key: 'credentials',
      header: '',
      // A pending account needs a code to activate; an active one needs a reset
      // link when its owner is locked out. Same gesture, different artefact.
      render: (u) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation(); // the row itself opens the edit form
            if (u.pending) codeMutation.mutate(u.id);
            else resetMutation.mutate(u.id);
          }}
          disabled={codeMutation.isPending || resetMutation.isPending}
          className="min-h-11 text-sm font-medium text-sgs-primary hover:underline disabled:text-slate-400"
        >
          {u.pending ? t('admin:users.newCode') : t('admin:users.resetPassword')}
        </button>
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
          onSaved={(wasCreate, result) => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['users'] });

            // On creation the account is only half the story: it stays unusable
            // until someone passes the code on, so that is what gets shown.
            if (wasCreate) {
              setHandout({ kind: 'code', value: result.activationCode, user: result });
              return;
            }
            toast.success(t('admin:users.toast.updated'));
          }}
        />
      )}

      {handout && <CredentialModal handout={handout} onClose={() => setHandout(null)} />}
    </div>
  );
}

/**
 * Shows a code or a reset link once, with a copy button.
 *
 * Deliberately a blocking dialog rather than a toast: the value cannot be
 * retrieved again, so it must not slide away while the administrator is looking
 * elsewhere.
 */
function CredentialModal({ handout, onClose }) {
  const { t } = useTranslation(['admin', 'common']);
  const [copied, setCopied] = useState(false);

  const isCode = handout.kind === 'code';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handout.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused - insecure origin, or a permission the
      // browser withholds. The value is on screen and selectable, so this is a
      // convenience rather than the only way out.
      toast.error(t('admin:users.copyFailed'));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isCode ? t('admin:users.codeTitle') : t('admin:users.resetTitle')}
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          {t('common:actions.close')}
        </button>
      }
    >
      <p className="text-sm text-slate-600">
        {isCode
          ? t('admin:users.codeBody', { name: handout.user?.name, email: handout.user?.email })
          : t('admin:users.resetBody', { name: handout.user?.name })}
      </p>

      <p
        className={`mt-4 select-all rounded-lg bg-slate-50 p-4 text-center font-mono text-slate-900 ${
          isCode ? 'text-3xl font-bold tracking-[0.3em]' : 'break-all text-xs'
        }`}
      >
        {handout.value}
      </p>

      <button type="button" onClick={copy} className="btn-secondary mt-4 w-full">
        {copied ? t('admin:users.copied') : t('admin:users.copy')}
      </button>

      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        {t('admin:users.handoutWarning')}
      </p>
    </Modal>
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
    },
  });

  const mutation = useMutation({
    mutationFn: (values) => (isEdit ? usersApi.update({ id: user.id, ...values }) : usersApi.create(values)),
    onSuccess: (result) => onSaved(!isEdit, result),
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
          mutation.mutate(values);
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

        {!isEdit && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            {t('admin:users.invitationNotice')}
          </p>
        )}

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
