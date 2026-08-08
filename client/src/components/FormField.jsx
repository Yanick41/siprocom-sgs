import { useTranslation } from 'react-i18next';

/**
 * Label + control + error, wired for accessibility.
 * Validation messages come from zod rule names translated via the `errors`
 * namespace, so forms stay bilingual without per-form translation work.
 */
export default function FormField({ label, name, error, required, hint, children }) {
  const { t } = useTranslation('errors');
  const errorId = `${name}-error`;

  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
        {required && (
          <span className="ml-0.5 text-sgs-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id: name,
        name,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? errorId : undefined,
        className: `input ${error ? 'border-sgs-danger focus:border-sgs-danger' : ''}`,
      })}

      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-sgs-danger">
          {t(error.message, { defaultValue: error.message || t('VALIDATION_FAILED') })}
        </p>
      )}
    </div>
  );
}
