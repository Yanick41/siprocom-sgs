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
