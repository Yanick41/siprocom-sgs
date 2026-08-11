/**
 * Renders every screen against realistic API payloads.
 *
 * Written after three screens shipped broken: their columns declared `value`
 * but DataTable only understood `render`, so each cell fell back to `row[key]`
 * and rendered a joined relation — an object — which React refuses. Route
 * checks all returned HTTP 200, because an SPA route always does. Only actually
 * mounting the component catches this class of fault.
 *
 * The payload shapes below mirror the API's `select` clauses exactly. That
 * fidelity is the whole point: a stubbed `warehouse: 'Entrepôt'` string would
 * have passed while the real object crashed.
 */

import { Component } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import api from '@/api/client';
import { AuthContext } from '@/context/AuthContext';

const ADMIN = { id: 'u1', name: 'Admin SIPROCOM', email: 'admin@siprocom.com', role: 'ADMIN', locale: 'fr' };

const WAREHOUSE = { id: 'w1', code: 'ENT-PRINCIPAL', name: 'Entrepôt Principal' };
const PRODUCT = {
  id: 'p1', reference: 'BOI-010', designation: 'Eau minérale 1.5L', designationEn: 'Mineral water 1.5L',
  unit: 'carton', minThreshold: 40, maxThreshold: 400, buyPrice: 1800, sellPrice: 2500,
  isActive: true, categoryId: 'c1', category: { id: 'c1', name: 'Eaux', nameEn: 'Water' },
  stockLevels: [{ warehouseId: 'w1', quantity: 120 }], totalStock: 120,
};
const paged = (items) => ({ items, pagination: { page: 1, limit: 25, total: items.length, totalPages: 1 } });

/** Answers each endpoint with the shape the real API returns. */
const ROUTES = [
  [/^\/products/, paged([PRODUCT])],
  [/^\/categories/, { items: [{ id: 'c0', name: 'Boissons', nameEn: 'Beverages', parentId: null, _count: { products: 0 }, children: [{ id: 'c1', name: 'Eaux', nameEn: 'Water', parentId: 'c0', _count: { products: 2 }, children: [] }] }] }],
  [/^\/suppliers/, paged([{ id: 's1', name: 'Distribution Ivoire SA', contact: 'M. Bamba', phone: '+225 07', email: 'a@b.ci', isActive: true, _count: { products: 3 } }])],
  [/^\/warehouses/, { items: [{ ...WAREHOUSE, address: 'Zone Industrielle', managerName: 'Koffi', isActive: true, _count: { stockLevels: 24 } }] }],
  [/^\/stock\/movements/, paged([{ id: 'm1', type: 'OUT', quantity: 12, balanceAfter: 108, reason: 'Vente', createdAt: '2026-08-10T09:00:00Z', product: PRODUCT, warehouse: WAREHOUSE, user: { id: 'u1', name: 'Koffi Mensah' } }])],
  [/^\/stock\/product/, { product: PRODUCT, totalStock: 120, movements: [] }],
  [/^\/stock/, paged([{ id: 'sl1', productId: 'p1', warehouseId: 'w1', quantity: 120, state: 'OK', product: PRODUCT, warehouse: WAREHOUSE }])],
  [/^\/receipts/, paged([{ id: 'r1', number: 'BE-2026-0001', status: 'DRAFT', reason: 'PURCHASE', receiptDate: '2026-08-10T09:00:00Z', supplier: { id: 's1', name: 'Distribution Ivoire SA' }, warehouse: WAREHOUSE, createdBy: { id: 'u1', name: 'Koffi' }, _count: { lines: 2 } }])],
  [/^\/issues/, paged([{ id: 'i1', number: 'BS-2026-0001', status: 'VALIDATED', reason: 'SALE', recipient: 'Client X', issueDate: '2026-08-10T09:00:00Z', warehouse: WAREHOUSE, destWarehouse: null, createdBy: { id: 'u1', name: 'Koffi' }, _count: { lines: 1 } }])],
  [/^\/alerts\/count/, { total: 2, minThreshold: 2, maxThreshold: 0 }],
  [/^\/alerts/, paged([{ id: 'a1', type: 'MIN_THRESHOLD', status: 'OPEN', quantityAtTrigger: 12, thresholdValue: 40, currentQuantity: 12, createdAt: '2026-08-10T09:00:00Z', product: PRODUCT, warehouse: WAREHOUSE }])],
  [/^\/reports\/dashboard/, {
    period: { from: '2026-07-10', to: '2026-08-10' },
    kpis: { productCount: 24, warehouseCount: 3, openAlerts: 2, movementsToday: 20, stockValue: 6876250, totalQuantity: 3910 },
    trending: [{ id: 'p1', reference: 'BOI-010', designation: 'Eau minérale 1.5L', designationEn: 'Mineral water', totalOut: 318, movementCount: 40, avgDailyOut: 10.6 }],
    curve: [{ label: '2026-08-09', totalIn: 50, totalOut: 30 }, { label: '2026-08-10', totalIn: 20, totalOut: 45 }],
    lowStock: [{ id: 'p2', reference: 'ALI-001', designation: 'Tomate 400g', designationEn: 'Tomato 400g', unit: 'unit', minThreshold: 50, warehouseName: 'Entrepôt Principal', quantity: 12 }],
    recentMovements: [{ id: 'm1', type: 'OUT', quantity: 12, createdAt: '2026-08-10T09:00:00Z', product: PRODUCT, warehouse: WAREHOUSE, user: { name: 'Koffi Mensah' } }],
  }],
  [/^\/reports\/trending/, { from: '2026-07-10', to: '2026-08-10', days: 30, items: [{ id: 'p1', reference: 'BOI-010', designation: 'Eau minérale', designationEn: 'Water', categoryName: 'Eaux', totalOut: 318, movementCount: 40, avgDailyOut: 10.6 }] }],
  [/^\/reports\/dormant/, { items: [{ id: 'p3', reference: 'EMB-004', designation: 'Film étirable', designationEn: 'Stretch film', categoryName: 'Emballage', currentStock: 100, totalOut: 0, lastMovement: null, tiedUpValue: 350000 }] }],
  [/^\/reports\/movements-summary/, { groupBy: 'category', items: [{ label: 'Boissons', totalIn: 500, totalOut: 420 }] }],
  [/^\/reports\/valuation/, { byCategory: [{ categoryName: 'Boissons', productCount: 8, totalQuantity: 900, buyValue: 1620000, sellValue: 2250000 }], totals: { productCount: 24, totalQuantity: 3910, buyValue: 6876250, sellValue: 9100000 } }],
  [/^\/users/, paged([{ id: 'u1', name: 'Admin SIPROCOM', email: 'admin@siprocom.com', role: 'ADMIN', isActive: true, locale: 'fr', lastLoginAt: '2026-08-10T09:00:00Z' }])],
  [/^\/audit-logs\/actions/, { items: ['LOGIN', 'VALIDATE_ISSUE'] }],
  [/^\/audit-logs/, paged([{ id: 'l1', action: 'LOGIN', entity: 'User', entityId: 'u1', ipAddress: '::1', createdAt: '2026-08-10T09:00:00Z', user: { id: 'u1', name: 'Admin', email: 'a@b.c', role: 'ADMIN' } }])],
  [/^\/auth\/me/, { user: ADMIN }],
];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) => {
    const match = ROUTES.find(([pattern]) => pattern.test(url));
    return match ? Promise.resolve(match[1]) : Promise.reject(new Error(`Unmocked GET ${url}`));
  });
});

/**
 * Records the first render error instead of letting it escape.
 *
 * Rows render on an async update, so a throw there lands outside the test's
 * call stack: vitest logs it as an unhandled error and the test still passes.
 * Catching it here turns it into an assertable value.
 */
class CaptureErrors extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? <div data-testid="render-error">{String(this.state.error.message)}</div> : this.props.children;
  }
}

/** Renders a screen with the providers it expects, signed in as ADMIN. */
function renderScreen(Screen) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = {
    user: ADMIN,
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    can: () => true,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <CaptureErrors>
            <Screen />
          </CaptureErrors>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Each screen is matched on a value that only exists once the fetched data has
 * been rendered — never on the static heading.
 *
 * The first version of this suite asserted on headings and passed with the very
 * bug it was written to catch: a heading is present on first paint, so the test
 * finished before the table ever rendered a row, and the crash landed after
 * teardown as an unhandled error that did not fail anything.
 */
const SCREENS = [
  ['Dashboard', () => import('@/features/dashboard/DashboardPage'), /BOI-010|Tomate/],
  ['Products', () => import('@/features/products/ProductsPage'), /BOI-010/],
  ['Categories', () => import('@/features/categories/CategoriesPage'), /Eaux|Water/],
  ['Suppliers', () => import('@/features/suppliers/SuppliersPage'), /Distribution Ivoire SA/],
  ['Warehouses', () => import('@/features/warehouses/WarehousesPage'), /ENT-PRINCIPAL/],
  ['Receipts', () => import('@/features/stock/ReceiptsPage'), /BE-2026-0001/],
  ['Issues', () => import('@/features/stock/IssuesPage'), /BS-2026-0001/],
  ['StockLevels', () => import('@/features/stock/StockLevelsPage'), /Entrepôt Principal/],
  ['Movements', () => import('@/features/stock/MovementsPage'), /BOI-010/],
  ['Adjustment', () => import('@/features/stock/AdjustmentPage'), /Entrepôt Principal/],
  ['Alerts', () => import('@/features/alerts/AlertsPage'), /BOI-010/],
  ['Reports', () => import('@/features/reports/ReportsPage'), /BOI-010/],
  ['Users', () => import('@/features/admin/UsersPage'), /admin@siprocom\.com/],
  ['AuditLog', () => import('@/features/admin/AuditLogPage'), /LOGIN/],
];

describe('every screen renders its fetched data', () => {
  for (const [name, importer, dataMarker] of SCREENS) {
    it(`${name} renders rows without React errors`, async () => {
      const errors = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));

      const { default: Screen } = await importer();
      const { container } = renderScreen(Screen);

      // Scoped to this render's container, never the global `screen`. Querying
      // document.body let one screen match a marker left behind by the previous
      // test — Movements "passed" in 48ms on markup Products had rendered.
      const view = within(container);

      // Settle on either outcome — the fetched value, or a captured crash — so
      // a failure reports the actual error rather than a bare timeout.
      await waitFor(
        () => {
          const crashed = view.queryByTestId('render-error');
          const rendered = view.queryAllByText(dataMarker).length > 0;
          expect(crashed || rendered).toBeTruthy();
        },
        { timeout: 8000 }
      );

      spy.mockRestore();

      const crash = view.queryByTestId('render-error');
      expect(crash, `${name} crashed while rendering: ${crash?.textContent}`).toBeNull();

      // Waiting on fetched content is what forces the rows to render, and
      // therefore what exercises every column's cell renderer.
      expect(
        view.queryAllByText(dataMarker).length,
        `${name} mounted but never rendered its data`
      ).toBeGreaterThan(0);

      const fatal = errors.filter((e) =>
        /not valid as a React child|Cannot read|is not a function|Each child in a list/i.test(e)
      );
      expect(fatal, `${name} logged React errors:\n${fatal.join('\n')}`).toHaveLength(0);
    });
  }
});
