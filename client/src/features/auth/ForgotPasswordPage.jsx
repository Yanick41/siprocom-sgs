import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { FiMail } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import FormField from '@/components/FormField';

/**
 * "Forgot password" request.
 *
 * The confirmation is deliberately non-committal — it never says whether the
 * address is known. Anything else would turn this form into a way to find out
 * who has an account, which is precisely what the login screen refuses to
 * disclose. The wording says "if an account exists" and means it.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation(['auth', 'common']);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: '' } });

  const mutation = useMutation({
    mutationFn: authApi.forgotPassword,
    // Failure is not reported either: a network error here would otherwise be
    // one more signal to probe with.
    onSettled: () => setSent(true),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-sgs-navy">{t('common:app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('common:app.subtitle')}</p>
          </header>

          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-sgs-navy/10">
                <FiMail className="size-6 text-sgs-navy" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">
                {t('auth:forgot.sentTitle')}
              </h2>
              <p className="mb-6 text-sm text-slate-500">{t('auth:forgot.sentBody')}</p>
              <Link to="/login" className="btn-primary inline-flex w-full justify-center">
                {t('auth:setPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('auth:forgot.title')}</h2>
              <p className="mb-6 text-sm text-slate-500">{t('auth:forgot.subtitle')}</p>

              <form
                onSubmit={handleSubmit((values) => mutation.mutate(values.email))}
                className="space-y-4"
                noValidate
              >
                <FormField
                  label={t('auth:login.email')}
                  name="email"
                  error={errors.email}
                  required
                >
                  {(props) => (
                    <input
                      {...props}
                      type="email"
                      autoFocus
                      autoComplete="username"
                      placeholder={t('auth:login.emailPlaceholder')}
                      {...register('email', { required: 'VALIDATION_FAILED' })}
                    />
                  )}
                </FormField>

                <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
                  {mutation.isPending ? t('auth:forgot.submitting') : t('auth:forgot.submit')}
                </button>
              </form>

              <p className="mt-6 text-center">
                <Link to="/login" className="text-sm font-medium text-sgs-navy hover:underline">
                  {t('auth:setPassword.backToLogin')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
