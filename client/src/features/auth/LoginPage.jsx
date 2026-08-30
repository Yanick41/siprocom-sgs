import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { FiEye, FiEyeOff, FiAlertCircle, FiArrowLeft } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import FormField from '@/components/FormField';
import PublicHeader, { HeaderAction } from '@/components/PublicHeader';

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common', 'errors', 'install']);
  const { login, isLoggingIn, isAuthenticated, isLoading } = useAuth();
  const translateError = useErrorMessage();
  const navigate = useNavigate();
  const location = useLocation();

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [attemptedEmail, setAttemptedEmail] = useState('');

  // Cheap and unauthenticated by design: it answers a boolean, nothing more.
  const setupQuery = useQuery({
    queryKey: ['auth', 'setup-status'],
    queryFn: authApi.setupStatus,
    retry: false,
    staleTime: 60_000,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: '', password: '' } });

  if (isLoading || setupQuery.isLoading) return null;
  if (isAuthenticated) return <Navigate to={location.state?.from || '/dashboard'} replace />;

  // An empty database has no account to sign in with, so send the user where
  // they can actually get in rather than letting them guess at credentials.
  if (setupQuery.data?.needsSetup) return <Navigate to="/setup" replace />;

  const onSubmit = async (values) => {
    setSubmitError(null);
    setAttemptedEmail(values.email);
    try {
      await login(values);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [class*="animate-"] { animation: none !important; } }
      `}</style>

      {/* Identical bar to the landing page, so arriving here reads as the same
          page changing rather than a jump to somewhere else. */}
      <PublicHeader
        action={
          <HeaderAction to="/" icon={FiArrowLeft} label={t('auth:login.backToLanding')} tone="ghost" />
        }
      />

      <main className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
        {/* The lime field carries over from the landing hero. On a phone it
            would cost a screenful before the form, so it is desktop only. */}
        <section className="hidden flex-col justify-center bg-sgs-primary px-12 py-16 lg:flex">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-sgs-citron">
            {t('install:eyebrow')}
          </p>
          <p className="mt-4 max-w-sm text-3xl font-extrabold leading-tight tracking-tight text-white">
            {t('auth:login.pitch')}
          </p>
          <div className="mt-8 h-1 w-24 rounded-full bg-sgs-citron/70" />
        </section>

        <section className="flex items-center justify-center px-5 py-12 sm:px-8">
          <div className="motion-safe:animate-[rise_400ms_ease-out_backwards] w-full max-w-sm">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-sgs-accent lg:hidden">
              {t('install:eyebrow')}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 lg:mt-0">
              {t('auth:login.title')}
            </h1>
            <p className="mb-8 mt-2 text-slate-500">{t('auth:login.subtitle')}</p>

          {submitError?.code === 'ACCOUNT_NOT_ACTIVATED' ? (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="flex items-start gap-2">
                <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{t('auth:login.notActivated')}</span>
              </p>
              <Link
                to={`/signup?email=${encodeURIComponent(attemptedEmail)}`}
                className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-sgs-primary px-4 font-medium text-white"
              >
                {t('auth:login.goActivate')}
              </Link>
            </div>
          ) : (
            submitError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{translateError(submitError)}</span>
              </div>
            )
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

            <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">
              {t('auth:login.forgotPassword')}
            </p>

            {/* The one page everyone already reaches, so the one place the
                install link is actually found. */}
            <p className="mt-3 text-sm">
              <Link to="/install" className="font-medium text-sgs-accent hover:underline">
                {t('auth:login.installApp')}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
