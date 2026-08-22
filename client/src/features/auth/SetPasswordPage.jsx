import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import FormField from '@/components/FormField';

/**
 * Landing page for an emailed link — both the invitation and the reset.
 *
 * One screen for both because they end in the same act: choose a password. Only
 * the heading differs, and the server says which by reporting the token's type.
 *
 * The token is checked before the form is shown, so an expired link says so
 * instead of offering a form that fails on submit.
 */
export default function SetPasswordPage() {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();

  const token = searchParams.get('token');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const checkQuery = useQuery({
    queryKey: ['auth', 'token', token],
    queryFn: () => authApi.inspectToken(token),
    enabled: Boolean(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({ defaultValues: { password: '', confirm: '' } });

  const password = watch('password') ?? '';

  const mutation = useMutation({
    mutationFn: authApi.setPassword,
    onSuccess: (result) => {
      // The server signs them in, so go straight to the dashboard rather than
      // asking for a password chosen ten seconds ago.
      queryClient.setQueryData(['auth', 'me'], result);
      navigate('/dashboard', { replace: true });
    },
    onError: setSubmitError,
  });

  const invalid = !token || (checkQuery.data && !checkQuery.data.valid);
  const isInvitation = checkQuery.data?.type === 'INVITATION';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-sgs-primary">{t('common:app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('common:app.subtitle')}</p>
          </header>

          {checkQuery.isLoading && (
            <p className="text-center text-sm text-slate-500">{t('auth:setPassword.checking')}</p>
          )}

          {invalid && (
            <div className="text-center">
              <FiAlertCircle className="mx-auto mb-3 size-8 text-red-500" />
              <h2 className="mb-2 text-lg font-semibold text-slate-900">
                {checkQuery.data?.reason === 'TOKEN_EXPIRED'
                  ? t('auth:setPassword.expiredTitle')
                  : t('auth:setPassword.invalidTitle')}
              </h2>
              <p className="mb-6 text-sm text-slate-500">{t('auth:setPassword.invalidBody')}</p>
              <p className="mb-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                {t('auth:setPassword.askAdmin')}
              </p>
              <Link to="/login" className="btn-primary inline-flex w-full justify-center">
                {t('auth:setPassword.backToLogin')}
              </Link>
            </div>
          )}

          {checkQuery.data?.valid && (
            <>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">
                {isInvitation ? t('auth:setPassword.welcomeTitle') : t('auth:setPassword.resetTitle')}
              </h2>
              <p className="mb-6 text-sm text-slate-500">
                {isInvitation
                  ? t('auth:setPassword.welcomeBody', { name: checkQuery.data.name })
                  : t('auth:setPassword.resetBody', { email: checkQuery.data.email })}
              </p>

              {submitError && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{translateError(submitError)}</span>
                </div>
              )}

              <form
                onSubmit={handleSubmit((values) => {
                  setSubmitError(null);
                  mutation.mutate({ token, password: values.password });
                })}
                className="space-y-4"
                noValidate
              >
                <FormField
                  label={t('auth:setPassword.password')}
                  name="password"
                  error={errors.password}
                  hint={t('auth:setup.passwordHint')}
                  required
                >
                  {(props) => (
                    <div className="relative">
                      <input
                        {...props}
                        type={showPassword ? 'text' : 'password'}
                        autoFocus
                        autoComplete="new-password"
                        className={`${props.className} pr-12`}
                        {...register('password', {
                          required: 'VALIDATION_FAILED',
                          minLength: { value: 12, message: 'PASSWORD_TOO_SHORT' },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={
                          showPassword ? t('auth:login.hidePassword') : t('auth:login.showPassword')
                        }
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                  )}
                </FormField>

                {/* A typo in a password nobody can read is only discovered at the
                    next login, when this is the only way in. */}
                <FormField
                  label={t('auth:setup.confirm')}
                  name="confirm"
                  error={errors.confirm}
                  required
                >
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

                <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
                  {mutation.isPending
                    ? t('auth:setPassword.submitting')
                    : t('auth:setPassword.submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
