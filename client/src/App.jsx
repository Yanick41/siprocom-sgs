import { Routes, Route, Navigate } from 'react-router-dom';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/layouts/AppLayout';
import LoginPage from '@/features/auth/LoginPage';
import SystemStatusPage from '@/features/system/SystemStatusPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ProductsPage from '@/features/products/ProductsPage';
import CategoriesPage from '@/features/categories/CategoriesPage';
import SuppliersPage from '@/features/suppliers/SuppliersPage';
import WarehousesPage from '@/features/warehouses/WarehousesPage';
import ReceiptsPage from '@/features/stock/ReceiptsPage';
import IssuesPage from '@/features/stock/IssuesPage';
import StockLevelsPage from '@/features/stock/StockLevelsPage';
import MovementsPage from '@/features/stock/MovementsPage';
import AdjustmentPage from '@/features/stock/AdjustmentPage';

/**
 * Routes land as their phase completes — see IMPLEMENTATION_PLAN.md §9.
 * Phase 3–4 adds /receipts, /issues, /transfers, /adjustments, /stock;
 * Phase 5–6 adds /alerts and /reports; Phase 7 adds /users, /audit, /settings.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/status" element={<SystemStatusPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/receipts"
          element={
            <ProtectedRoute permission="stock.view">
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/issues"
          element={
            <ProtectedRoute permission="stock.view">
              <IssuesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute permission="stock.view">
              <StockLevelsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/movements"
          element={
            <ProtectedRoute permission="stock.view">
              <MovementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/adjustments"
          element={
            <ProtectedRoute permission="stock.write">
              <AdjustmentPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/products"
          element={
            <ProtectedRoute permission="products.view">
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute permission="categories.view">
              <CategoriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute permission="suppliers.view">
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/warehouses"
          element={
            <ProtectedRoute permission="warehouses.view">
              <WarehousesPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
