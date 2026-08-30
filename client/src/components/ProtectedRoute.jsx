import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';

/**
 * Gates a route behind authentication and, optionally, a permission.
 * This is UX, not security - the API authorises every request independently.
 */
export default function ProtectedRoute({ children, permission }) {
  const { isAuthenticated, isLoading, can } = useAuth();
  const location = useLocation();
  const { t } = useTranslation(['common', 'errors']);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">{t('common:states.loading')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !can(permission)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold text-slate-800">{t('errors:FORBIDDEN')}</p>
        <a href="/dashboard" className="btn-secondary">
          {t('common:actions.back')}
        </a>
      </div>
    );
  }

  return children;
}

/** Renders children only when the user holds the permission. */
export function PermissionGate({ permission, children, fallback = null }) {
  const { can } = useAuth();
  return can(permission) ? children : fallback;
}
