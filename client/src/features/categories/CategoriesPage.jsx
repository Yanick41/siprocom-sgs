import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FiPlus, FiEdit2, FiTrash2, FiFolder, FiCornerDownRight } from 'react-icons/fi';
import toast from 'react-hot-toast';

import { categoriesApi } from '@/api/resources';
import { PermissionGate } from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import Modal from '@/components/Modal';
import FormField from '@/components/FormField';

export default function CategoriesPage() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const lng = i18n.resolvedLanguage;
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();
  const { can } = useAuth();

  const [editing, setEditing] = useState(null);

  const treeQuery = useQuery({ queryKey: ['categories', 'tree'], queryFn: categoriesApi.tree });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const removeMutation = useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: () => {
      invalidate();
      toast.success(t('admin:categories.toast.deleted'));
    },
    onError: (error) => toast.error(translateError(error)),
  });

  const label = (category) => (lng === 'en' && category.nameEn ? category.nameEn : category.name);

  const renderRow = (category, isChild = false) => (
    <div
      key={category.id}
      className={`flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${
        isChild ? 'pl-10' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isChild ? (
          <FiCornerDownRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
        ) : (
          <FiFolder className="size-4 shrink-0 text-sgs-accent" aria-hidden="true" />
        )}
        <span className={`truncate ${isChild ? 'text-slate-700' : 'font-medium text-slate-900'}`}>
          {label(category)}
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {t('admin:categories.productCount', { count: category._count?.products ?? 0 })}
        </span>
      </div>

      {can('categories.write') && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setEditing(category)}
            aria-label={t('common:actions.edit')}
            className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <FiEdit2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('admin:categories.confirmDelete', { name: label(category) }))) {
                removeMutation.mutate(category.id);
              }
            }}
            aria-label={t('common:actions.delete')}
            className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-sgs-danger"
          >
            <FiTrash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );

  const roots = treeQuery.data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('admin:categories.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin:categories.subtitle')}</p>
        </div>
        <PermissionGate permission="categories.write">
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <FiPlus className="size-4" />
            {t('admin:categories.new')}
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        {treeQuery.isLoading && <p className="p-8 text-center text-slate-500">{t('common:states.loading')}</p>}
        {treeQuery.isError && (
          <p className="p-8 text-center text-sgs-danger">{translateError(treeQuery.error)}</p>
        )}
        {!treeQuery.isLoading && !treeQuery.isError && roots.length === 0 && (
          <p className="p-8 text-center text-slate-500">{t('common:states.empty')}</p>
        )}
        {roots.map((root) => (
          <div key={root.id}>
            {renderRow(root)}
            {root.children?.map((child) => renderRow(child, true))}
          </div>
        ))}
      </div>

      {editing && (
        <CategoryFormModal
          category={editing.id ? editing : null}
          roots={roots}
          onClose={() => setEditing(null)}
          onSaved={(wasCreate) => {
            setEditing(null);
            invalidate();
            toast.success(
              wasCreate ? t('admin:categories.toast.created') : t('admin:categories.toast.updated')
            );
          }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, roots, onClose, onSaved }) {
  const { t } = useTranslation(['admin', 'common']);
  const translateError = useErrorMessage();
  const isEdit = Boolean(category);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: category?.name ?? '',
      description: category?.description ?? '',
      parentId: category?.parentId ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values) =>
      isEdit ? categoriesApi.update({ id: category.id, ...values }) : categoriesApi.create(values),
    onSuccess: () => onSaved(!isEdit),
    onError: setSubmitError,
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? t('admin:categories.editTitle') : t('admin:categories.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button type="submit" form="category-form" disabled={mutation.isPending} className="btn-primary">
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
        id="category-form"
        onSubmit={handleSubmit((values) => {
          setSubmitError(null);
          mutation.mutate({
            ...values,
            parentId: values.parentId || null,
            description: values.description || null,
          });
        })}
        className="space-y-4"
        noValidate
      >
        <FormField label={t('admin:categories.nameFr')} name="name" error={errors.name} required>
          {(props) => <input {...props} type="text" {...register('name', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <FormField
          label={t('admin:categories.parent')}
          name="parentId"
          error={errors.parentId}
          hint={t('admin:categories.parentHint')}
        >
          {(props) => (
            <select {...props} {...register('parentId')}>
              <option value="">{t('admin:categories.noParent')}</option>
              {roots
                .filter((r) => r.id !== category?.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
        </FormField>

        <FormField label={t('common:fields.notes')} name="description" error={errors.description}>
          {(props) => <textarea {...props} rows={2} className={`${props.className} py-2`} {...register('description')} />}
        </FormField>
      </form>
    </Modal>
  );
}
