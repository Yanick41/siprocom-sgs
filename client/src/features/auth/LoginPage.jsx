import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';

import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import FormField from '@/components/FormField';

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { login, isLoggingIn, isAuthenticated, isLoading } = useAuth();
  const translateError = useErrorMessage();
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: '', password: '' } });

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/dashboard'} replace />;

  const onSubmit = async (values) => {
    setSubmitError(null);
    try {
      await login(values);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-end">
          {/* Available before authentication — a user who cannot read French
              must be able to switch the language to sign in. */}
          <LanguageSwitcher />
        </div>

        <div className="card p-6 sm:p-8">
          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-sgs-navy">{t('common:app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('common:app.subtitle')}</p>
          </header>

          <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('auth:login.title')}</h2>
          <p className="mb-6 text-sm text-slate-500">{t('auth:login.subtitle')}</p>

          {submitError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{translateError(submitError)}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField label={t('auth:login.email')} name="email" error={errors.email} required>
              {(props) => (
                <input
                  {...props}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder={t('auth:login.emailPlaceholder')}
                  {...register('email', { required: 'VALIDATION_FAILED' })}
                />
              )}
            </FormField>

            <FormField
              label={t('auth:login.password')}
              name="password"
              error={errors.password}
              required
            >
              {(props) => (
                <div className="relative">
                  <input
                    {...props}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('auth:login.passwordPlaceholder')}
                    className={`${props.className} pr-12`}
                    {...register('password', { required: 'VALIDATION_FAILED' })}
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

            <button type="submit" disabled={isLoggingIn} className="btn-primary w-full">
              {isLoggingIn ? t('auth:login.submitting') : t('auth:login.submit')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
