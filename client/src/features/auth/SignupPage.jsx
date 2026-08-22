import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FiEye, FiEyeOff, FiAlertCircle } from 'react-icons/fi';

import { authApi } from '@/api/resources';
import { useErrorMessage } from '@/hooks/useErrorMessage';
import FormField from '@/components/FormField';

const CODE_LENGTH = 6;

/**
 * Account creation, in two steps.
 *
 * Reachable only by someone an administrator has already invited: the server
 * refuses a code for an address it holds no pending invitation for. The screen
 * is a completion flow wearing a signup flow's clothes, deliberately — the
 * person fills in their own name and chooses their own password, and nobody
 * ever types a colleague's secret for them (BR-11).
 *
 * Both steps live in one component so going back keeps what was typed. Nothing
 * reaches the database until the code is confirmed, so an abandoned signup
 * leaves no half-built account behind.
 */
export default function SignupPage() {
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const translateError = useErrorMessage();

  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));

  const codeInputs = useRef([]);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      // Pre-filled when the administrator hands over a link carrying the address,
      // so nobody retypes what was already chosen for them.
      email: searchParams.get('email') ?? '',
      password: '',
      confirm: '',
    },
  });

  const password = watch('password') ?? '';
  const email = watch('email') ?? '';

  const checkInvitation = useMutation({
    mutationFn: authApi.signupCheck,
    onSuccess: () => {
      setSubmitError(null);
      setStep(2);
      setTimeout(() => codeInputs.current[0]?.focus(), 50);
    },
    onError: setSubmitError,
  });

  const complete = useMutation({
    mutationFn: authApi.signupComplete,
    onSuccess: (result) => {
      queryClient.setQueryData(['auth', 'me'], result);
      navigate('/dashboard', { replace: true });
    },
    onError: setSubmitError,
  });

  const codeValue = code.join('');

  /** Accepts a paste of the whole code as readily as six keystrokes. */
  const setDigit = (index, raw) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) {
      setCode((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }

    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = digits[i];
      }
      return next;
    });

    const landed = Math.min(index + digits.length, CODE_LENGTH - 1);
    codeInputs.current[landed]?.focus();
  };

  const onCodeKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeInputs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) codeInputs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f6] p-4">
      <div className="w-full max-w-[390px] sm:max-w-[440px]">
        <div className="rounded-[20px] bg-white p-6 shadow-sm sm:p-8">
          <header className="text-center">
            <h1 className="text-2xl font-bold text-sgs-primary">{t('common:app.name')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('common:app.subtitle')}</p>
          </header>

          {/* Two segments, filled up to the step in hand. */}
          <div className="mt-6 flex gap-2" aria-hidden="true">
            {[1, 2].map((n) => (
              <span
                key={n}
                className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-sgs-primary' : 'bg-slate-200'}`}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            {t('auth:signup.stepOf', { current: step, total: 2 })}
          </p>

          {submitError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              <FiAlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{translateError(submitError)}</span>
            </div>
          )}

          {step === 1 ? (
            <>
              <h2 className="mt-6 text-xl font-bold text-slate-900">{t('auth:signup.title')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('auth:signup.subtitle')}</p>

              <form
                onSubmit={handleSubmit((values) => {
                  setSubmitError(null);
                  checkInvitation.mutate(values.email);
                })}
                className="mt-6 space-y-5"
                noValidate
              >
                <FormField
                  label={t('auth:signup.firstName')}
                  name="firstName"
                  error={errors.firstName}
                  required
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      autoFocus
                      autoComplete="given-name"
                      placeholder={t('auth:signup.firstName')}
                      {...register('firstName', { required: 'VALIDATION_FAILED' })}
                    />
                  )}
                </FormField>

                <FormField
                  label={t('auth:signup.lastName')}
                  name="lastName"
                  error={errors.lastName}
                  required
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      autoComplete="family-name"
                      placeholder={t('auth:signup.lastName')}
                      {...register('lastName', { required: 'VALIDATION_FAILED' })}
                    />
                  )}
                </FormField>

                <FormField label={t('auth:login.email')} name="email" error={errors.email} required>
                  {(props) => (
                    <input
                      {...props}
                      type="email"
                      autoComplete="username"
                      placeholder="vous@entreprise.com"
                      {...register('email', { required: 'VALIDATION_FAILED' })}
                    />
                  )}
                </FormField>

                <FormField
                  label={t('auth:login.password')}
                  name="password"
                  error={errors.password}
                  hint={t('auth:signup.passwordHint')}
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
                          minLength: { value: 8, message: 'PASSWORD_TOO_SHORT' },
                          validate: {
                            lower: (v) => /[a-z]/.test(v) || 'PASSWORD_NEEDS_LOWERCASE',
                            upper: (v) => /[A-Z]/.test(v) || 'PASSWORD_NEEDS_UPPERCASE',
                            digit: (v) => /[0-9]/.test(v) || 'PASSWORD_NEEDS_DIGIT',
                          },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
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

                <FormField
                  label={t('auth:signup.confirm')}
                  name="confirm"
                  error={errors.confirm}
                  required
                >
                  {(props) => (
                    <div className="relative">
                      <input
                        {...props}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className={`${props.className} pr-12`}
                        {...register('confirm', {
                          required: 'VALIDATION_FAILED',
                          validate: (v) => v === password || 'PASSWORDS_DO_NOT_MATCH',
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
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

                <button
                  type="submit"
                  disabled={checkInvitation.isPending}
                  className="h-[50px] w-full rounded-[10px] bg-sgs-primary font-bold text-white disabled:opacity-60"
                >
                  {checkInvitation.isPending ? t('auth:signup.checking') : t('auth:signup.continue')}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                {t('auth:signup.haveAccount')}{' '}
                <Link to="/login" className="font-medium text-sgs-primary hover:underline">
                  {t('auth:login.submit')}
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-xl font-bold text-slate-900">
                {t('auth:signup.verifyTitle')}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t('auth:signup.verifySubtitle', { email })}
              </p>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmitError(null);
                  const values = getValues();
                  complete.mutate({
                    email: values.email,
                    code: codeValue,
                    firstName: values.firstName,
                    lastName: values.lastName,
                    password: values.password,
                  });
                }}
                className="mt-6"
                noValidate
              >
                <fieldset>
                  <legend className="sr-only">{t('auth:signup.codeLegend')}</legend>
                  <div className="flex justify-between gap-2">
                    {code.map((digit, index) => (
                      <input
                        // eslint-disable-next-line react/no-array-index-key -- fixed-length positional inputs
                        key={index}
                        ref={(el) => {
                          codeInputs.current[index] = el;
                        }}
                        value={digit}
                        onChange={(e) => setDigit(index, e.target.value)}
                        onKeyDown={(e) => onCodeKeyDown(index, e)}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={CODE_LENGTH}
                        aria-label={t('auth:signup.digitLabel', { position: index + 1 })}
                        className="h-14 w-full min-w-0 rounded-[10px] border border-slate-300 text-center text-xl font-semibold text-slate-900 focus:border-sgs-primary focus:outline-none"
                      />
                    ))}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={codeValue.length < CODE_LENGTH || complete.isPending}
                  className="mt-6 h-[50px] w-full rounded-[10px] bg-sgs-primary font-bold text-white disabled:opacity-60"
                >
                  {complete.isPending ? t('auth:signup.verifying') : t('auth:signup.verify')}
                </button>
              </form>

              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
                {t('auth:signup.codeFromAdmin')}
              </p>

              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  setStep(1);
                }}
                className="mt-4 h-[50px] w-full rounded-[10px] border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('auth:signup.back')}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
