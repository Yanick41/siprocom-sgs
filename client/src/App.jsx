import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';
import LoginPage from '@/features/auth/LoginPage';
import lazyWithRetry from '@/lib/lazyWithRetry';

/**
 * Routes are code-split per screen.
 *
 * Charting (recharts) and the export libraries together weigh more than the
 * rest of the application. Bundled eagerly, a magasinier who spends the day on
 * goods issues would download the whole reporting stack to never open it.
 * Each screen now pulls only what it uses.
 *
 * Login stays eager — it is the first thing an unauthenticated visitor needs,
 * and a spinner before the sign-in form would be a poor first impression.
 *
 * lazyWithRetry, not lazy: a chunk can become unreachable after a deploy or a
 * Vite re-optimisation, and the screen should recover instead of failing.
 */
const SetupPage = lazyWithRetry(() => import('@/features/auth/SetupPage'), 'setup');
const SetPasswordPage = lazyWithRetry(() => import('@/features/auth/SetPasswordPage'), 'set-password');
const ForgotPasswordPage = lazyWithRetry(() => import('@/features/auth/ForgotPasswordPage'), 'forgot-password');
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Redirects to /login as soon as an account exists — the server refuses
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
        path="/set-password"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <SetPasswordPage />
          </Suspense>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<ScreenFallback />}>
            <ForgotPasswordPage />
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
        <Route path="/adjustments" element={guarded('stock.write', AdjustmentPage)} />

        <Route path="/products" element={guarded('products.view', ProductsPage)} />
        <Route path="/categories" element={guarded('categories.view', CategoriesPage)} />
        <Route path="/suppliers" element={guarded('suppliers.view', SuppliersPage)} />

        <Route path="/alerts" element={guarded('alerts.view', AlertsPage)} />
        <Route path="/reports" element={guarded('reports.view', ReportsPage)} />

        <Route path="/users" element={guarded('users.manage', UsersPage)} />
        <Route path="/audit" element={guarded('audit.view', AuditLogPage)} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
