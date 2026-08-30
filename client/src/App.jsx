import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';
import LoginPage from '@/features/auth/LoginPage';
import lazyWithRetry from '@/lib/lazyWithRetry';
import { useAuth } from '@/context/AuthContext';

/**
 * Routes are code-split per screen.
 *
 * The export libraries (jspdf, and the zip writer behind .xlsx) weigh more than the
 * rest of the application. Bundled eagerly, a magasinier who spends the day on
 * goods issues would download the whole reporting stack to never open it.
 * Each screen now pulls only what it uses.
 *
 * Login stays eager - it is the first thing an unauthenticated visitor needs,
 * and a spinner before the sign-in form would be a poor first impression.
 *
 * lazyWithRetry, not lazy: a chunk can become unreachable after a deploy or a
 * Vite re-optimisation, and the screen should recover instead of failing.
 */
const SetupPage = lazyWithRetry(() => import('@/features/auth/SetupPage'), 'setup');
const SetPasswordPage = lazyWithRetry(() => import('@/features/auth/SetPasswordPage'), 'set-password');
const SignupPage = lazyWithRetry(() => import('@/features/auth/SignupPage'), 'signup');
const SystemStatusPage = lazyWithRetry(() => import('@/features/system/SystemStatusPage'), 'status');
const DashboardPage = lazyWithRetry(() => import('@/features/dashboard/DashboardPage'), 'dashboard');
const ProductsPage = lazyWithRetry(() => import('@/features/products/ProductsPage'), 'products');
const CategoriesPage = lazyWithRetry(() => import('@/features/categories/CategoriesPage'), 'categories');
const SuppliersPage = lazyWithRetry(() => import('@/features/suppliers/SuppliersPage'), 'suppliers');
const ReceiptsPage = lazyWithRetry(() => import('@/features/stock/ReceiptsPage'), 'receipts');
const IssuesPage = lazyWithRetry(() => import('@/features/stock/IssuesPage'), 'issues');
const StockLevelsPage = lazyWithRetry(() => import('@/features/stock/StockLevelsPage'), 'stock');
const MovementsPage = lazyWithRetry(() => import('@/features/stock/MovementsPage'), 'movements');
const AdjustmentPage = lazyWithRetry(() => import('@/features/stock/AdjustmentPage'), 'adjustments');
const AlertsPage = lazyWithRetry(() => import('@/features/alerts/AlertsPage'), 'alerts');
const ReportsPage = lazyWithRetry(() => import('@/features/reports/ReportsPage'), 'reports');
const UsersPage = lazyWithRetry(() => import('@/features/admin/UsersPage'), 'users');
const AuditLogPage = lazyWithRetry(() => import('@/features/admin/AuditLogPage'), 'audit');
const SyncQueuePage = lazyWithRetry(() => import('@/features/system/SyncQueuePage'), 'sync');
const InstallPage = lazyWithRetry(() => import('@/features/system/InstallPage'), 'install');
const BootstrapAdminPage = lazyWithRetry(
  () => import('@/features/auth/BootstrapAdminPage'),
  'bootstrap-admin'
);

function ScreenFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-slate-500">{t('states.loading')}</p>
    </div>
  );
}

/** Wraps a screen in its permission guard and the lazy-loading fallback. */
const guarded = (permission, Screen) => (
  <ProtectedRoute permission={permission}>
    <Suspense fallback={<ScreenFallback />}>
      <Screen />
    </Suspense>
  </ProtectedRoute>
);

/**
 * What the bare link opens.
 *
 * Someone sent the address for the first time gets the install page: that is
 * the whole point of handing out a link, and a login form tells a new
 * colleague nothing about how to get the app onto their phone.
 *
 * Two exceptions, both of which would otherwise be daily irritations. Anyone
 * already signed in goes straight to their dashboard rather than being asked
 * to install what they are evidently using. And a launch from an installed
 * icon skips it too, because opening your own app to "install this app" is
 * absurd. The manifest points start_url at /dashboard as well, so an installed
 * launch does not even reach here.
 */
function RootRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

  // Deciding before /auth/me settles would flash the install page at someone
  // who is signed in, on every single load.
  if (isLoading) return <ScreenFallback />;
  if (isAuthenticated || standalone) return <Navigate to="/dashboard" replace />;

  return (
    <Suspense fallback={<ScreenFallback />}>
      <InstallPage />
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Redirects to /login as soon as an account exists - the server refuses
          the underlying endpoint regardless, so this is convenience, not the guard. */}
      <Route
        path="/setup"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <SetupPage />
          </Suspense>
        }
      />
      {/* Both are reached from an emailed link, so they must work signed out. */}
      <Route
        path="/signup"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <SignupPage />
          </Suspense>
        }
      />
      <Route
        path="/set-password"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <SetPasswordPage />
          </Suspense>
        }
      />
      <Route
        path="/status"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <SystemStatusPage />
          </Suspense>
        }
      />
      {/* Break glass. Not linked from anywhere on purpose: the server answers
          404 unless ADMIN_BOOTSTRAP_SECRET is set, so this screen is a form
          around a request that usually does not exist. */}
      <Route
        path="/bootstrap-admin"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <BootstrapAdminPage />
          </Suspense>
        }
      />
      {/* Public: the person being onboarded has no account yet, so putting
          this behind the login they cannot pass would defeat it. */}
      <Route
        path="/install"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <InstallPage />
          </Suspense>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<ScreenFallback />}>
              <DashboardPage />
            </Suspense>
          }
        />

        <Route path="/receipts" element={guarded('stock.view', ReceiptsPage)} />
        <Route path="/issues" element={guarded('stock.view', IssuesPage)} />
        <Route path="/stock" element={guarded('stock.view', StockLevelsPage)} />
        <Route path="/movements" element={guarded('stock.view', MovementsPage)} />
        {/* Anyone who can record stock can see what of theirs has not been sent. */}
        <Route path="/sync" element={guarded('stock.view', SyncQueuePage)} />
        <Route path="/adjustments" element={guarded('stock.write', AdjustmentPage)} />

        <Route path="/products" element={guarded('products.view', ProductsPage)} />
        <Route path="/categories" element={guarded('categories.view', CategoriesPage)} />
        <Route path="/suppliers" element={guarded('suppliers.view', SuppliersPage)} />

        <Route path="/alerts" element={guarded('alerts.view', AlertsPage)} />
        <Route path="/reports" element={guarded('reports.view', ReportsPage)} />

        <Route path="/users" element={guarded('users.manage', UsersPage)} />
        <Route path="/audit" element={guarded('audit.view', AuditLogPage)} />
      </Route>

      <Route path="/" element={<RootRoute />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
