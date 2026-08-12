import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiEye, FiEyeOff, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import FormField from '@/components/FormField';

/**
 * First-run administrator creation.
 *
 * Reachable only while the database holds no user. The server enforces that
 * with a conditional INSERT; this screen just reflects it, and redirects to the
 * login page the moment an account exists. Both halves matter: without the
 * server check this would be an open registration endpoint.
 */
export default function SetupPage() {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const statusQuery = useQuery({
    queryKey: ['auth', 'setup-status'],
    queryFn: authApi.setupStatus,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '', warehouseName: '' },
  });

  const password = watch('password') ?? '';

  const mutation = useMutation({
    mutationFn: authApi.setup,
    onSuccess: (result) => {
      // The server signs the new administrator in, so seed the cache and go
      // straight to the dashboard rather than asking for the password again.
      queryClient.setQueryData(['auth', 'me'], result);
      navigate('/dashboard', { replace: true });
    },
    onError: setSubmitError,
  });

  if (statusQuery.isLoading) return null;
  if (statusQuery.data && !statusQuery.data.needsSetup) return <Navigate to="/login" replace />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">

        <div className="card p-6 sm:p-8">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-sgs-navy">{t('common:app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('common:app.subtitle')}</p>
          </header>

          <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('auth:setup.title')}</h2>
          <p className="mb-6 text-sm text-slate-500">{t('auth:setup.subtitle')}</p>

          {submitError && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{translateError(submitError)}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit((values) => {
              setSubmitError(null);
              mutation.mutate({
                name: values.name,
                email: values.email,
                password: values.password,
                warehouseName: values.warehouseName || undefined,
              });
            })}
            className="space-y-4"
            noValidate
          >
            <FormField label={t('auth:setup.name')} name="name" error={errors.name} required>
              {(props) => (
                <input {...props} type="text" autoFocus autoComplete="name" {...register('name', { required: 'VALIDATION_FAILED' })} />
              )}
            </FormField>

            <FormField label={t('auth:login.email')} name="email" error={errors.email} required>
              {(props) => (
                <input {...props} type="email" autoComplete="username" {...register('email', { required: 'VALIDATION_FAILED' })} />
              )}
            </FormField>

            <FormField
              label={t('auth:login.password')}
              name="password"
              error={errors.password}
              required
              hint={t('auth:setup.passwordHint')}
            >
              {(props) => (
                <div className="relative">
                  <input
                    {...props}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`${props.className} pr-12`}
                    {...register('password', {
                      required: 'VALIDATION_FAILED',
                      minLength: { value: 12, message: 'PASSWORD_TOO_SHORT' },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth:login.hidePassword') : t('auth:login.showPassword')}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              )}
            </FormField>

            {/* Typos in a password nobody can read are found at the next login,
                when the account is already the only way in. */}
            <FormField label={t('auth:setup.confirm')} name="confirm" error={errors.confirm} required>
              {(props) => (
                <input
                  {...props}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('confirm', {
                    required: 'VALIDATION_FAILED',
                    validate: (value) => value === password || 'PASSWORDS_DO_NOT_MATCH',
                  })}
                />
              )}
            </FormField>

            <FormField
              label={t('auth:setup.warehouseName')}
              name="warehouseName"
              error={errors.warehouseName}
              hint={t('auth:setup.warehouseHint')}
            >
              {(props) => <input {...props} type="text" placeholder="Entrepôt principal" {...register('warehouseName')} />}
            </FormField>

            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
              {mutation.isPending ? t('auth:setup.submitting') : t('auth:setup.submit')}
            </button>
          </form>

          <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <FiCheckCircle className="mt-0.5 size-3.5 shrink-0 text-sgs-accent" />
            {t('auth:setup.oneTimeNotice')}
          </p>
        </div>
      </div>
    </main>
  );
}
