import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { FiEye, FiEyeOff, FiAlertTriangle, FiCheckCircle, FiArrowLeft } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import { useAuth } from '@/context/AuthContext';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import FormField from '@/components/FormField';
import PublicHeader, { HeaderAction } from '@/components/PublicHeader';

/**
 * Break-glass administrator recovery, as a screen.
 *
 * Deliberately not linked from anywhere: no nav entry, no button on the login
 * page. Someone reaching it has been told the address. That is not the
 * security boundary either - the server refuses the endpoint outright unless
 * ADMIN_BOOTSTRAP_SECRET is set, and answers 404 to a wrong secret exactly as
 * it would to an unknown path.
 *
 * So this page is a form around one request, and it is honest about what it
 * is: the warning is the first thing on it, and the confirmation ends by
 * telling the operator to switch the secret back off. A recovery tool that
 * does not say that is how a break-glass becomes permanent.
 */
/** Long enough to read the warning above it, short enough not to feel stuck. */
const REDIRECT_SECONDS = 5;

export default function BootstrapAdminPage() {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const translateError = useErrorMessage();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [signInFailed, setSignInFailed] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  /**
   * Counts down on screen rather than redirecting silently, so the warning
   * above it is read as an instruction and not as a flash of green.
   */
  useEffect(() => {
    if (!result || signInFailed) return undefined;
    if (countdown <= 0) {
      navigate('/dashboard', { replace: true });
      return undefined;
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [result, signInFailed, countdown, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { secret: '', name: '', email: '', password: '', confirm: '', role: 'ADMIN' },
  });

  const password = watch('password') ?? '';

  /**
   * Signs the new administrator in and sends them to the dashboard.
   *
   * The endpoint deliberately issues no cookie, so this signs in through the
   * ordinary /login route with the credentials just typed. That keeps the
   * property the endpoint was written for - the password is proven to work,
   * rather than a session being handed over that hides a typo until the next
   * time anyone tries - while still landing on the dashboard without anyone
   * retyping anything.
   *
   * The redirect waits a few seconds rather than firing at once, because the
   * confirmation carries the instruction to unset ADMIN_BOOTSTRAP_SECRET. That
   * sentence is the difference between a recovery tool and a permanent back
   * door, and a page nobody sees cannot deliver it.
   */
  const mutation = useMutation({
    mutationFn: authApi.bootstrapAdmin,
    onSuccess: async (data, variables) => {
      setResult(data);
      try {
        await login({ email: variables.email, password: variables.password });
      } catch {
        // The account exists; only the sign-in failed. Say so and leave the
        // login link, rather than reporting a failure that did not happen.
        setSignInFailed(true);
      }
    },
    onError: setSubmitError,
  });

  if (result) {
    return (
      <div className="min-h-screen bg-white">
        <PublicHeader
          action={<HeaderAction to="/login" icon={FiArrowLeft} label={t('auth:login.submit')} tone="ghost" />}
        />
        <main className="mx-auto max-w-md px-5 py-16">
          <div className="mb-5 flex items-start gap-3">
            <FiCheckCircle className="mt-0.5 size-6 shrink-0 text-sgs-accent" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {result.replacedExistingAccount
                  ? t('auth:bootstrap.doneReplaced')
                  : t('auth:bootstrap.doneCreated')}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {result.user.name} - {result.user.email} - {t(`auth:roles.${result.user.role}`)}
              </p>
            </div>
          </div>

          {/* The most important sentence on the screen, so it is not a footnote. */}
          <div role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">{t('auth:bootstrap.turnOffTitle')}</p>
            <p className="mt-1">{t('auth:bootstrap.turnOffBody')}</p>
          </div>

          {signInFailed ? (
            <>
              <p className="mb-4 text-sm text-slate-600">{t('auth:bootstrap.signInFailed')}</p>
              <Link to="/login" className="btn-primary w-full justify-center">
                {t('auth:bootstrap.goToLogin')}
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate('/dashboard', { replace: true })}
                className="btn-primary w-full justify-center"
              >
                {t('auth:bootstrap.goToDashboard')}
              </button>
              <p aria-live="polite" className="mt-3 text-center text-sm text-slate-500">
                {t('auth:bootstrap.redirecting', { count: countdown })}
              </p>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader
        action={<HeaderAction to="/login" icon={FiArrowLeft} label={t('auth:login.submit')} tone="ghost" />}
      />

      <main className="mx-auto max-w-md px-5 py-12">
        <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-xl bg-amber-50 p-4">
          <FiAlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">{t('auth:bootstrap.title')}</p>
            <p className="mt-1">{t('auth:bootstrap.warning')}</p>
          </div>
        </div>

        {submitError && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {/* A 404 here means the secret is wrong or the feature is off. The
                server refuses to tell those apart on purpose, so neither can
                this message. */}
            {submitError.status === 404
              ? t('auth:bootstrap.refused')
              : translateError(submitError)}
          </div>
        )}

        <form
          onSubmit={handleSubmit((values) => {
            setSubmitError(null);
            // Stripped rather than sent: the confirmation is a typo guard for
            // the person, and the server has no use for it.
            const { confirm: _confirm, ...payload } = values;
            mutation.mutate(payload);
          })}
          className="space-y-4"
          noValidate
        >
          <FormField
            label={t('auth:bootstrap.secret')}
            name="secret"
            error={errors.secret}
            hint={t('auth:bootstrap.secretHint')}
            required
          >
            {(props) => (
              <input
                {...props}
                type="password"
                autoComplete="off"
                {...register('secret', { required: 'VALIDATION_FAILED' })}
              />
            )}
          </FormField>

          <FormField label={t('auth:bootstrap.name')} name="name" error={errors.name} required>
            {(props) => (
              <input {...props} type="text" {...register('name', { required: 'VALIDATION_FAILED' })} />
            )}
          </FormField>

          <FormField label={t('auth:bootstrap.email')} name="email" error={errors.email} required>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="username"
                {...register('email', { required: 'VALIDATION_FAILED' })}
              />
            )}
          </FormField>

          <FormField label={t('auth:bootstrap.role')} name="role" error={errors.role}>
            {(props) => (
              <select {...props} {...register('role')}>
                <option value="ADMIN">{t('auth:roles.ADMIN')}</option>
                <option value="MAGASINIER">{t('auth:roles.MAGASINIER')}</option>
                <option value="ACHATS">{t('auth:roles.ACHATS')}</option>
                <option value="DIRECTION">{t('auth:roles.DIRECTION')}</option>
              </select>
            )}
          </FormField>

          <FormField
            label={t('auth:bootstrap.password')}
            name="password"
            error={errors.password}
            hint={t('auth:bootstrap.passwordHint')}
            required
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
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={t(showPassword ? 'auth:login.hidePassword' : 'auth:login.showPassword')}
                  className="absolute right-0 top-0 flex size-11 items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <FiEyeOff className="size-4" /> : <FiEye className="size-4" />}
                </button>
              </div>
            )}
          </FormField>

          <FormField
            label={t('auth:bootstrap.confirm')}
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

          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary w-full justify-center"
          >
            {mutation.isPending ? t('common:states.loading') : t('auth:bootstrap.submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
