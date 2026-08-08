import { Routes, Route, Navigate } from 'react-router-dom';
import SystemStatusPage from '@/features/system/SystemStatusPage';

/**
 * Phase 0 router. Feature routes are added as each phase lands:
 *   /login, /dashboard, /products, /stock, /alerts, /reports, /admin/*
 * See IMPLEMENTATION_PLAN.md §9 for the full screen inventory.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/status" element={<SystemStatusPage />} />
      <Route path="*" element={<Navigate to="/status" replace />} />
    </Routes>
  );
}
