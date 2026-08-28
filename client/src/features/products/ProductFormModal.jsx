import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';

import { productsApi } from '@/api/resources';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import Modal from '@/components/Modal';
import FormField from '@/components/FormField';
import { GROUPING_UNITS } from '@/lib/units';
import { CONTAINERS } from '@/lib/containers';


export default function ProductFormModal({ product, categories, onClose, onSaved }) {
  const { t, i18n } = useTranslation(['products', 'common', 'errors']);
  const lng = i18n.resolvedLanguage;
  const translateError = useErrorMessage();
  const isEdit = Boolean(product);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      reference: product?.reference ?? '',
      designation: product?.designation ?? '',
      categoryId: product?.categoryId ?? '',
      container: product?.container ?? '',
      minThreshold: product?.minThreshold ?? 0,
      maxThreshold: product?.maxThreshold ?? '',
      buyPrice: product?.buyPrice ?? 0,
      sellPrice: product?.sellPrice ?? 0,
      groupingUnit: product?.groupingUnit ?? '',
      cartonBuyPrice: product?.cartonBuyPrice ?? '',
      unitsPerCarton: product?.unitsPerCarton ?? '',
      cartonSellPrice: product?.cartonSellPrice ?? '',
    },
  });

  // The carton fields only make sense together, so the price appears once a
  // factor is entered rather than sitting empty on every product.
  const unitsPerCarton = Number(watch('unitsPerCarton')) || 0;
  const sellsByCarton = unitsPerCarton >= 2;
  const sellPrice = Number(watch('sellPrice')) || 0;
  const cartonSellPrice = Number(watch('cartonSellPrice')) || 0;

  // A hint, never a block: a carton cheaper than its contents is usually a typo,
  // but a clearance rate is a legitimate reason to want exactly that.
  const cartonPriceLooksWrong =
    sellsByCarton && cartonSellPrice > 0 && sellPrice > 0 && cartonSellPrice < sellPrice;

  const mutation = useMutation({
    mutationFn: (values) =>
      isEdit ? productsApi.update({ id: product.id, ...values }) : productsApi.create(values),
    onSuccess: () => onSaved(!isEdit),
    onError: (error) => setSubmitError(error),
  });

  const onSubmit = (values) => {
    setSubmitError(null);
    mutation.mutate({
      ...values,
      // Empty optional fields must be null, not "" - the API distinguishes them.
      maxThreshold: values.maxThreshold === '' ? null : Number(values.maxThreshold),
      unitsPerCarton: values.unitsPerCarton === '' ? null : Number(values.unitsPerCarton),
      // Clearing the factor must clear the price too, or a product that is no
      // longer sold by the carton keeps a carton price nobody can reach.
      groupingUnit: values.unitsPerCarton === '' ? null : values.groupingUnit || 'carton',
      cartonBuyPrice:
        values.unitsPerCarton === '' || values.cartonBuyPrice === '' ? null : Number(values.cartonBuyPrice),
      cartonSellPrice:
        values.unitsPerCarton === '' || values.cartonSellPrice === ''
          ? null
          : Number(values.cartonSellPrice),
      container: values.container || null,
    });
  };

  // Only leaf categories hold products.
  const selectableCategories = categories.filter((c) => c.parentId);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? t('products:form.editTitle') : t('products:form.createTitle')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? t('common:states.loading') : t('common:actions.save')}
          </button>
        </>
      }
    >
      {submitError && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {translateError(submitError)}
        </div>
      )}

      <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common:fields.reference')} name="reference" error={errors.reference} required>
            {(props) => <input {...props} type="text" {...register('reference', { required: 'VALIDATION_FAILED' })} />}
          </FormField>
        </div>

        <FormField label={t('products:form.designationFr')} name="designation" error={errors.designation} required>
          {(props) => <input {...props} type="text" {...register('designation', { required: 'VALIDATION_FAILED' })} />}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common:fields.category')} name="categoryId" error={errors.categoryId} required>
            {(props) => (
              <select {...props} {...register('categoryId', { required: 'VALIDATION_FAILED' })}>
                <option value="">-</option>
                {selectableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lng === 'en' && c.nameEn ? c.nameEn : c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label={t('products:form.container')}
            name="container"
            error={errors.container}
            hint={t('products:form.containerHint')}
          >
            {(props) => (
              <select {...props} {...register('container')}>
                <option value="">-</option>
                {CONTAINERS.map((c) => (
                  <option key={c} value={c}>
                    {t(`common:containers.${c}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('products:form.minThreshold')}
            name="minThreshold"
            error={errors.minThreshold}
            hint={t('products:form.minThresholdHint')}
          >
            {(props) => <input {...props} type="number" min="0" {...register('minThreshold')} />}
          </FormField>

          <FormField
            label={t('products:form.maxThreshold')}
            name="maxThreshold"
            error={errors.maxThreshold}
            hint={t('products:form.maxThresholdHint')}
          >
            {(props) => <input {...props} type="number" min="0" {...register('maxThreshold')} />}
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('products:form.buyPrice')} name="buyPrice" error={errors.buyPrice}>
            {(props) => <input {...props} type="number" min="0" step="1" {...register('buyPrice')} />}
          </FormField>

          <FormField label={t('products:form.sellPrice')} name="sellPrice" error={errors.sellPrice}>
            {(props) => <input {...props} type="number" min="0" step="1" {...register('sellPrice')} />}
          </FormField>
        </div>

        {/* Carton sales - optional. The unit above stays the base unit that
            stock, thresholds and alerts are counted in. */}
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">{t('products:form.cartonSection')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Which group, and how many base units it holds - the two are
                meaningless apart, so they sit together. */}
            <FormField label={t('products:form.groupingUnit')} name="groupingUnit" error={errors.groupingUnit}>
              {(props) => (
                <select {...props} {...register('groupingUnit')}>
                  <option value="">-</option>
                  {GROUPING_UNITS.map((g) => (
                    <option key={g} value={g}>
                      {t(`common:units.${g}`)}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label={t('products:form.unitsPerCarton')}
              name="unitsPerCarton"
              error={errors.unitsPerCarton}
              hint={t('products:form.unitsPerCartonHint')}
            >
              {(props) => (
                <input {...props} type="number" min="2" placeholder="12" {...register('unitsPerCarton')} />
              )}
            </FormField>

            {sellsByCarton && (
              <>
                {/* Buying by the carton usually costs less per unit than buying
                    loose, so the group has its own purchase price. */}
                <FormField
                  label={t('products:form.cartonBuyPrice')}
                  name="cartonBuyPrice"
                  error={errors.cartonBuyPrice}
                >
                  {(props) => (
                    <input {...props} type="number" min="0" step="1" {...register('cartonBuyPrice')} />
                  )}
                </FormField>

                <FormField
                  label={t('products:form.cartonSellPrice')}
                  name="cartonSellPrice"
                  error={errors.cartonSellPrice}
                  hint={t('products:form.cartonSellPriceHint', {
                    reference: (unitsPerCarton * sellPrice).toLocaleString('fr-FR'),
                  })}
                >
                  {(props) => (
                    <input {...props} type="number" min="0" step="1" {...register('cartonSellPrice')} />
                  )}
                </FormField>
              </>
            )}
          </div>

          {cartonPriceLooksWrong && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              {t('products:form.cartonPriceWarning')}
            </p>
          )}
        </div>

      </form>
    </Modal>
  );
}
