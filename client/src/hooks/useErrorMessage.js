import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Maps an ApiError code to a translated sentence.
 * The API never sends prose — this is where codes become language.
 */
export function useErrorMessage() {
  const { t } = useTranslation('errors');

  return useCallback(
    (error) => {
      const code = error?.code || 'UNKNOWN';
      // details feed interpolation, e.g. INSUFFICIENT_STOCK { available, requested }
      return t(code, { ...(error?.details || {}), defaultValue: t('UNKNOWN') });
    },
    [t]
  );
}
