import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';
import LoginPage from '@/features/auth/LoginPage';

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
 */
const SystemStatusPage = lazy(() => import('@/features/system/SystemStatusPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'));
const CategoriesPage = lazy(() => import('@/features/categories/CategoriesPage'));
const SuppliersPage = lazy(() => import('@/features/suppliers/SuppliersPage'));
const WarehousesPage = lazy(() => import('@/features/warehouses/WarehousesPage'));
const ReceiptsPage = lazy(() => import('@/features/stock/ReceiptsPage'));
const IssuesPage = lazy(() => import('@/features/stock/IssuesPage'));
const StockLevelsPage = lazy(() => import('@/features/stock/StockLevelsPage'));
const MovementsPage = lazy(() => import('@/features/stock/MovementsPage'));
const AdjustmentPage = lazy(() => import('@/features/stock/AdjustmentPage'));
const AlertsPage = lazy(() => import('@/features/alerts/AlertsPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const UsersPage = lazy(() => import('@/features/admin/UsersPage'));
const AuditLogPage = lazy(() => import('@/features/admin/AuditLogPage'));

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
        <Route path="/warehouses" element={guarded('warehouses.view', WarehousesPage)} />

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
